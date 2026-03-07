const PurchaseOrder = require('../models/PurchaseOrder');
const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const Vendor = require('../models/Vendor');
const orderNumberGenerator = require('../utils/orderNumberGenerator');
const StockProcessor = require('./stockProcessor');

class ManualOrderService {
  async createManualOrder(orderData, userId) {
    const { vendor, orderDate, items } = orderData;

    // Validate required fields
    if (!vendor || !vendor.name) {
      throw new Error('Vendor name is required');
    }
    if (!orderDate) {
      throw new Error('Order date is required');
    }
    if (!items || items.length === 0) {
      throw new Error('At least one item is required');
    }

    // Validate order date is not in the future
    if (new Date(orderDate) > new Date()) {
      throw new Error('Order date cannot be in the future');
    }

    // Generate unique order number
    const orderNumber = await orderNumberGenerator.generateManualOrderNumber();

    // Validate and process items
    const processedItems = [];
    let subtotal = 0;

    for (const item of items) {
      if (!item.sku) {
        throw new Error('Item SKU is required');
      }
      if (!item.qty || item.qty <= 0) {
        throw new Error('Item quantity must be greater than 0');
      }
      if (item.unitPrice === undefined || item.unitPrice < 0) {
        throw new Error('Item unit price must be non-negative');
      }

      // Verify SKU exists in manual PO items
      const manualPoItem = await ManualPurchaseOrderItem.findOne({
        sku: item.sku.toUpperCase(),
        isActive: true
      });

      if (!manualPoItem) {
        throw new Error(`Manual PO item with SKU ${item.sku} not found or inactive`);
      }

      const lineTotal = item.qty * item.unitPrice;
      subtotal += lineTotal;

      processedItems.push({
        sku: item.sku.toUpperCase(),
        name: item.name || manualPoItem.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal
      });
    }

    // Calculate totals
    const tax = orderData.tax || 0;
    const shipping = orderData.shipping || 0;
    const total = subtotal + tax + shipping;

    // Create the order
    const order = new PurchaseOrder({
      source: 'manual',
      sourceOrderId: orderNumber, // Use order number as source ID for manual orders
      orderNumber,
      status: orderData.status || 'confirmed',
      orderDate: new Date(orderDate),
      vendor: {
        name: vendor.name,
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: vendor.address || ''
      },
      items: processedItems,
      subtotal,
      tax,
      shipping,
      total,
      notes: orderData.notes || '',
      createdBy: userId,
      lastUpdatedBy: userId
    });

    await order.save();

    console.log(`Manual order ${orderNumber} created. Stock will be processed after manual verification.`);

    return order;
  }

  async getNextOrderNumber() {
    return await orderNumberGenerator.generateManualOrderNumber();
  }

  async getManualOrderByNumber(orderNumber) {
    const order = await PurchaseOrder.findOne({
      source: 'manual',
      orderNumber
    }).populate('createdBy lastUpdatedBy', 'name email');

    if (!order) {
      throw new Error('Manual order not found');
    }

    return order;
  }

  async getAllManualOrders(filters = {}) {
    const query = { source: 'manual' };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.dateFrom || filters.dateTo) {
      query.orderDate = {};
      if (filters.dateFrom) {
        query.orderDate.$gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        query.orderDate.$lte = new Date(filters.dateTo);
      }
    }

    if (filters.vendor) {
      query['vendor.name'] = new RegExp(filters.vendor, 'i');
    }

    const orders = await PurchaseOrder.find(query)
      .populate('createdBy lastUpdatedBy', 'name email')
      .sort({ orderDate: -1 });

    return {
      orders,
      total: orders.length
    };
  }

  async updateManualOrder(orderNumber, updateData, userId) {
    const order = await PurchaseOrder.findOne({
      source: 'manual',
      orderNumber
    });

    if (!order) {
      throw new Error('Manual order not found');
    }

    // If stock was already processed, reverse it before updating
    if (order.stockProcessed) {
      await StockProcessor.reverseOrderStockMovements(order, userId);
    }

    // Update basic fields
    if (updateData.vendor) {
      if (updateData.vendor.name) order.vendor.name = updateData.vendor.name;
      if (updateData.vendor.email !== undefined) order.vendor.email = updateData.vendor.email;
      if (updateData.vendor.phone !== undefined) order.vendor.phone = updateData.vendor.phone;
      if (updateData.vendor.address !== undefined) order.vendor.address = updateData.vendor.address;
    }

    if (updateData.orderDate) {
      // Validate order date is not in the future
      if (new Date(updateData.orderDate) > new Date()) {
        throw new Error('Order date cannot be in the future');
      }
      order.orderDate = new Date(updateData.orderDate);
    }

    if (updateData.status) {
      order.status = updateData.status;
    }

    if (updateData.notes !== undefined) {
      order.notes = updateData.notes;
    }

    // Update items if provided
    if (updateData.items) {
      if (updateData.items.length === 0) {
        throw new Error('At least one item is required');
      }

      const processedItems = [];
      let subtotal = 0;

      for (const item of updateData.items) {
        if (!item.sku) {
          throw new Error('Item SKU is required');
        }
        if (!item.qty || item.qty <= 0) {
          throw new Error('Item quantity must be greater than 0');
        }
        if (item.unitPrice === undefined || item.unitPrice < 0) {
          throw new Error('Item unit price must be non-negative');
        }

        // Verify SKU exists in manual PO items
        const manualPoItem = await ManualPurchaseOrderItem.findOne({
          sku: item.sku.toUpperCase(),
          isActive: true
        });

        if (!manualPoItem) {
          throw new Error(`Manual PO item with SKU ${item.sku} not found or inactive`);
        }

        const lineTotal = item.qty * item.unitPrice;
        subtotal += lineTotal;

        processedItems.push({
          sku: item.sku.toUpperCase(),
          name: item.name || manualPoItem.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          lineTotal
        });
      }

      order.items = processedItems;
      order.subtotal = subtotal;

      const tax = updateData.tax !== undefined ? updateData.tax : order.tax;
      const shipping = updateData.shipping !== undefined ? updateData.shipping : order.shipping;

      order.tax = tax;
      order.shipping = shipping;
      order.total = subtotal + tax + shipping;
    }

    order.lastUpdatedBy = userId;
    order.stockProcessed = false;
    order.stockProcessedAt = null;

    await order.save();

    console.log(`Manual order ${orderNumber} updated. Stock will be processed after manual verification.`);

    return order;
  }

  async deleteManualOrder(orderNumber, userId) {
    const order = await PurchaseOrder.findOne({
      source: 'manual',
      orderNumber
    });

    if (!order) {
      throw new Error('Manual order not found');
    }

    // If stock was processed, reverse it before deleting
    if (order.stockProcessed) {
      await StockProcessor.reverseOrderStockMovements(order, userId);
    }

    await PurchaseOrder.findByIdAndDelete(order._id);
    console.log(`Manual order ${orderNumber} deleted`);

    return order;
  }
}

module.exports = new ManualOrderService();
