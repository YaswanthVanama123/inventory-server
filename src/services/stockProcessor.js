const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const Product = require('../models/Product');
const PurchaseOrder = require('../models/PurchaseOrder');
const ExternalInvoice = require('../models/ExternalInvoice');
const itemCaseQuantityService = require('./itemCaseQuantity.service');


class StockProcessor {
  static async processPurchaseOrder(purchaseOrder, userId = null) {
    if (purchaseOrder.stockProcessed) {
      console.log(`Purchase order ${purchaseOrder.orderNumber} already processed`);
      return;
    }
    if (!purchaseOrder.items || purchaseOrder.items.length === 0) {
      purchaseOrder.stockProcessed = true;
      purchaseOrder.stockProcessedAt = new Date();
      await purchaseOrder.save();
      return [];
    }
    const caseMap = await itemCaseQuantityService.getLookupMap();
    const docs = purchaseOrder.items.map((item) => ({
      sku: item.sku,
      type: 'IN',
      qty: itemCaseQuantityService.toUnits(caseMap, item.sku, item.qty),
      refType: 'PURCHASE_ORDER',
      refId: purchaseOrder._id,
      sourceRef: purchaseOrder.orderNumber,
      notes: `Purchase from ${purchaseOrder.vendor.name}`,
      createdBy: userId,
    }));
    const movements = await StockMovement.insertMany(docs, { ordered: false });
    for (const item of purchaseOrder.items) {
      try {
        const units = itemCaseQuantityService.toUnits(caseMap, item.sku, item.qty);
        await this.updateStockSummary(item.sku, units, 'IN', userId);
        console.log(`Stock IN: ${item.sku} +${units} from PO ${purchaseOrder.orderNumber}`);
      } catch (error) {
        console.error(`Error updating stock summary for ${item.sku}:`, error.message);
        throw error;
      }
    }
    purchaseOrder.stockProcessed = true;
    purchaseOrder.stockProcessedAt = new Date();
    await purchaseOrder.save();
    return movements;
  }
  static async processInvoice(invoice, userId = null) {
    if (invoice.stockProcessed) {
      console.log(`Invoice ${invoice.invoiceNumber} already processed`);
      return;
    }
    if (!invoice.items || invoice.items.length === 0) {
      invoice.stockProcessed = true;
      invoice.stockProcessedAt = new Date();
      await invoice.save();
      return [];
    }
    const skus = [...new Set(invoice.items.map((i) => i.sku))];
    const stockSummaries = await StockSummary.find({ sku: { $in: skus } })
      .select('sku availableQty')
      .lean();
    const stockBySku = new Map(stockSummaries.map((s) => [s.sku, s.availableQty]));
    for (const item of invoice.items) {
      const available = stockBySku.get(item.sku) || 0;
      if (available < item.qty) {
        console.warn(`Insufficient stock for ${item.sku}: available ${available}, needed ${item.qty}`);
      }
    }
    const docs = invoice.items.map((item) => ({
      sku: item.sku,
      type: 'OUT',
      qty: item.qty,
      refType: 'INVOICE',
      refId: invoice._id,
      sourceRef: invoice.invoiceNumber,
      notes: `Sale to ${invoice.customer.name}`,
      createdBy: userId,
    }));
    const movements = await StockMovement.insertMany(docs, { ordered: false });
    for (const item of invoice.items) {
      try {
        await this.updateStockSummary(item.sku, item.qty, 'OUT', userId);
        console.log(`Stock OUT: ${item.sku} -${item.qty} from Invoice ${invoice.invoiceNumber}`);
      } catch (error) {
        console.error(`Error updating stock summary for ${item.sku}:`, error.message);
        throw error;
      }
    }
    invoice.stockProcessed = true;
    invoice.stockProcessedAt = new Date();
    await invoice.save();
    return movements;
  }
  static async updateStockSummary(sku, qty, type, userId = null) {
    let stockSummary = await StockSummary.findOne({ sku });
    if (!stockSummary) {
      const product = await Product.findOne({ sku });
      stockSummary = await StockSummary.create({
        sku,
        product: product?._id,
        availableQty: 0,
        reservedQty: 0,
        totalInQty: 0,
        totalOutQty: 0,
        lowStockThreshold: 10,
        createdBy: userId,
        lastUpdatedBy: userId
      });
    }
    if (type === 'IN') {
      stockSummary.addStock(qty);
    } else if (type === 'OUT') {
      stockSummary.removeStock(qty);
    } else if (type === 'ADJUST') {
      stockSummary.availableQty += qty; 
      stockSummary.lastMovement = new Date();
    }
    stockSummary.lastUpdatedBy = userId;
    await stockSummary.save();
    return stockSummary;
  }
  static async processUnprocessedPurchaseOrders(userId = null) {
    const unprocessedOrders = await PurchaseOrder.getUnprocessedOrders();
    let processedCount = 0;
    for (const order of unprocessedOrders) {
      try {
        await this.processPurchaseOrder(order, userId);
        processedCount++;
      } catch (error) {
        console.error(`Error processing purchase order ${order.orderNumber}:`, error.message);
      }
    }
    console.log(`Processed ${processedCount} purchase orders`);
    return processedCount;
  }
  static async processUnprocessedInvoices(userId = null) {
    const unprocessedInvoices = await ExternalInvoice.getUnprocessedInvoices();
    let processedCount = 0;
    for (const invoice of unprocessedInvoices) {
      try {
        await this.processInvoice(invoice, userId);
        processedCount++;
      } catch (error) {
        console.error(`Error processing invoice ${invoice.invoiceNumber}:`, error.message);
      }
    }
    console.log(`Processed ${processedCount} invoices`);
    return processedCount;
  }
  static async createAdjustment(sku, qty, reason, userId = null) {
    const movement = await StockMovement.create({
      sku,
      type: 'ADJUST',
      qty,
      refType: 'ADJUSTMENT',
      refId: userId, 
      notes: reason,
      createdBy: userId
    });
    await this.updateStockSummary(sku, qty, 'ADJUST', userId);
    console.log(`Stock ADJUST: ${sku} ${qty > 0 ? '+' : ''}${qty} - ${reason}`);
    return movement;
  }
  static async recalculateStockSummary(sku) {
    const summary = await StockMovement.getStockSummaryBySKU(sku);
    let stockSummary = await StockSummary.findOne({ sku });
    if (!stockSummary) {
      const product = await Product.findOne({ sku });
      stockSummary = new StockSummary({
        sku,
        product: product?._id
      });
    }
    stockSummary.availableQty = summary.currentStock;
    stockSummary.totalInQty = summary.totalIn;
    stockSummary.totalOutQty = summary.totalOut;
    stockSummary.lastMovement = new Date();
    await stockSummary.save();
    console.log(`Recalculated stock for ${sku}: ${summary.currentStock} units`);
    return stockSummary;
  }
  static async getCurrentStock(sku) {
    const stockSummary = await StockSummary.findOne({ sku });
    return stockSummary ? stockSummary.availableQty : 0;
  }
  static async isLowStock(sku) {
    const stockSummary = await StockSummary.findOne({ sku }).populate('product');
    if (!stockSummary) return false;
    return stockSummary.isLowStock;
  }

  static async reverseOrderStockMovements(purchaseOrder, userId = null) {
    if (!purchaseOrder.stockProcessed) {
      console.log(`Purchase order ${purchaseOrder.orderNumber} not processed, nothing to reverse`);
      return;
    }

    const reversalMovements = [];
    const caseMap = await itemCaseQuantityService.getLookupMap();

    for (const item of purchaseOrder.items) {
      try {
        const units = itemCaseQuantityService.toUnits(caseMap, item.sku, item.qty);

        const movement = await StockMovement.create({
          sku: item.sku,
          type: 'OUT',
          qty: units,
          refType: 'PURCHASE_ORDER_REVERSAL',
          refId: purchaseOrder._id,
          sourceRef: purchaseOrder.orderNumber,
          notes: `Reversal: Order update/delete - ${purchaseOrder.vendor.name}`,
          createdBy: userId
        });

        reversalMovements.push(movement);

        await this.updateStockSummary(item.sku, units, 'OUT', userId);

        console.log(`Stock reversal: ${item.sku} -${units} from PO ${purchaseOrder.orderNumber}`);
      } catch (error) {
        console.error(`Error reversing item ${item.sku}:`, error.message);
        throw error;
      }
    }

    console.log(`Reversed stock for ${purchaseOrder.orderNumber}`);
    return reversalMovements;
  }

  static async processItemVerification(order, item, receivedQty, verificationId, userId = null) {
    try {
      const caseMap = await itemCaseQuantityService.getLookupMap();
      const unitsPerCase = itemCaseQuantityService.unitsPerCase(caseMap, item.sku);
      const units = (receivedQty || 0) * unitsPerCase;

      const movement = await StockMovement.create({
        sku: item.sku,
        type: 'IN',
        qty: units,
        refType: 'ITEM_VERIFICATION',
        refId: order._id,
        sourceRef: `${order.orderNumber} - Verification ${verificationId}`,
        notes: unitsPerCase > 1
          ? `Partial receipt: ${receivedQty} x ${unitsPerCase} = ${units} units from ${order.vendor?.name || 'Unknown Vendor'}`
          : `Partial receipt: ${units} units from ${order.vendor?.name || 'Unknown Vendor'}`,
        createdBy: userId
      });

      await this.updateStockSummary(item.sku, units, 'IN', userId);

      console.log(`✓ Stock IN (Verification): ${item.sku} +${units} from Order ${order.orderNumber}`);

      return movement;
    } catch (error) {
      console.error(`✗ Error processing item verification for ${item.sku}:`, error.message);
      throw error;
    }
  }
}
module.exports = StockProcessor;
