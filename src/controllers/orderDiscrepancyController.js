const OrderDiscrepancy = require('../models/OrderDiscrepancy');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const ModelCategory = require('../models/ModelCategory');
const PurchaseOrder = require('../models/PurchaseOrder');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const StockProcessor = require('../services/stockProcessor');


exports.getOrderDiscrepancies = async (req, res, next) => {
  try {
    const {
      status,
      discrepancyType,
      orderNumber,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;
    const query = {};
    if (status) query.status = status;
    if (discrepancyType) query.discrepancyType = discrepancyType;
    if (orderNumber) query.orderNumber = new RegExp(orderNumber, 'i');
    if (startDate || endDate) {
      query.reportedAt = {};
      if (startDate) query.reportedAt.$gte = new Date(startDate);
      if (endDate) query.reportedAt.$lte = new Date(endDate);
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [discrepancies, total] = await Promise.all([
      OrderDiscrepancy.find(query)
        .populate('reportedBy', 'username fullName email')
        .populate('resolvedBy', 'username fullName email')
        .populate('orderId', 'orderNumber orderDate status vendor')
        .sort({ reportedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      OrderDiscrepancy.countDocuments(query)
    ]);
    res.status(200).json({
      success: true,
      data: {
        discrepancies,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get order discrepancies error:', error);
    next(error);
  }
};
exports.getOrderDiscrepanciesByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const discrepancies = await OrderDiscrepancy.getByOrderId(orderId);
    res.status(200).json({
      success: true,
      data: discrepancies
    });
  } catch (error) {
    console.error('Get order discrepancies by order ID error:', error);
    next(error);
  }
};
exports.verifyOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { items, allGood, notes } = req.body;

    let order = await CustomerConnectOrder.findById(orderId);
    let isManualOrder = false;

    if (!order) {
      order = await PurchaseOrder.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }
      isManualOrder = true;
    }

    const createdDiscrepancies = [];
    const partiallyVerifiedItems = [];

    if (allGood) {
      console.log(`✓ Order ${order.orderNumber} verified - All Good (Fully Received)`);

      order.items.forEach(item => {
        item.receivedQuantity = item.qty;
        item.remainingQuantity = 0;
        item.itemVerified = true;
        item.itemVerifiedAt = new Date();
        item.itemVerifiedBy = req.user._id;
        if (!item.verificationHistory) item.verificationHistory = [];
        item.verificationHistory.push({
          receivedQty: item.qty,
          verifiedAt: new Date(),
          verifiedBy: req.user._id,
          notes: notes || 'All items received as expected'
        });
      });

      order.verified = true;
      order.verifiedAt = new Date();
      order.verifiedBy = req.user._id;
      await order.save();

      if (!order.stockProcessed) {
        try {
          await StockProcessor.processPurchaseOrder(order, req.user._id);
          console.log(`✓ Stock processed for order ${order.orderNumber}`);
        } catch (stockError) {
          console.error(`✗ Failed to process stock for order ${order.orderNumber}:`, stockError.message);
          return res.status(500).json({
            success: false,
            message: 'Order verified but stock processing failed: ' + stockError.message
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Order fully received and verified - stock processed',
        data: {
          order,
          discrepancies: []
        }
      });
    }

    for (const item of items) {
      const orderItem = order.items.find(oi => oi.sku === item.sku);
      if (!orderItem) {
        console.warn(`Item ${item.sku} not found in order ${order.orderNumber}`);
        continue;
      }

      const receivingNow = parseFloat(item.receivedQuantity || 0);
      if (receivingNow <= 0) {
        continue;
      }

      const previouslyReceived = orderItem.receivedQuantity || 0;
      const newTotalReceived = previouslyReceived + receivingNow;
      const expectedQuantity = orderItem.qty;
      const newRemaining = Math.max(0, expectedQuantity - newTotalReceived);

      if (!orderItem.verificationHistory) orderItem.verificationHistory = [];
      orderItem.verificationHistory.push({
        receivedQty: receivingNow,
        verifiedAt: new Date(),
        verifiedBy: req.user._id,
        notes: item.notes || notes
      });

      orderItem.receivedQuantity = newTotalReceived;
      orderItem.remainingQuantity = newRemaining;

      if (newTotalReceived >= expectedQuantity) {
        orderItem.itemVerified = true;
        orderItem.itemVerifiedAt = new Date();
        orderItem.itemVerifiedBy = req.user._id;
        console.log(`  ✓ Item ${item.sku} fully received: ${newTotalReceived}/${expectedQuantity}`);
      } else {
        orderItem.itemVerified = false;
        partiallyVerifiedItems.push({
          sku: item.sku,
          name: item.itemName,
          expected: expectedQuantity,
          received: newTotalReceived,
          remaining: newRemaining
        });
        console.log(`  ⚠ Item ${item.sku} partially received: ${newTotalReceived}/${expectedQuantity} (${newRemaining} remaining)`);
      }

      if (newTotalReceived !== expectedQuantity) {
        const discrepancy = await OrderDiscrepancy.createDiscrepancy({
          orderId: order._id,
          orderNumber: order.orderNumber,
          sku: item.sku,
          itemName: item.itemName,
          expectedQuantity,
          receivedQuantity: newTotalReceived,
          reportedBy: req.user._id,
          notes: item.notes || notes,
          status: 'pending'
        });
        createdDiscrepancies.push(discrepancy);

        try {
          const mapping = await ModelCategory.findOne({ modelNumber: item.sku });
          const categoryName = mapping ? mapping.categoryItemName : item.itemName;

          await StockDiscrepancy.create({
            invoiceNumber: order.orderNumber,
            invoiceId: order._id,
            invoiceType: isManualOrder ? 'PurchaseOrder' : 'CustomerConnectOrder',
            itemName: item.itemName,
            itemSku: item.sku,
            categoryName: categoryName,
            systemQuantity: expectedQuantity,
            actualQuantity: newTotalReceived,
            difference: newTotalReceived - expectedQuantity,
            discrepancyType: newTotalReceived < expectedQuantity ? 'Shortage' : 'Overage',
            reason: 'Order verification discrepancy',
            notes: item.notes || notes,
            status: 'Pending',
            reportedBy: req.user._id
          });
        } catch (stockDiscError) {
          console.error(`Failed to create StockDiscrepancy for ${item.sku}:`, stockDiscError.message);
        }

        console.log(`  ✗ Discrepancy: Expected ${expectedQuantity}, Total Received ${newTotalReceived}`);
      }
    }

    const allItemsFullyReceived = order.items.every(item => item.receivedQuantity >= item.qty);

    if (allItemsFullyReceived) {
      order.verified = true;
      order.verifiedAt = new Date();
      order.verifiedBy = req.user._id;
    }

    await order.save();

    if (allItemsFullyReceived && !order.stockProcessed) {
      try {
        await StockProcessor.processPurchaseOrder(order, req.user._id);
        console.log(`✓ Stock processed for order ${order.orderNumber}`);
      } catch (stockError) {
        console.error(`✗ Failed to process stock for order ${order.orderNumber}:`, stockError.message);
        return res.status(500).json({
          success: false,
          message: 'Order verified but stock processing failed: ' + stockError.message,
          data: {
            order,
            discrepancies: createdDiscrepancies,
            partiallyVerifiedItems
          }
        });
      }
    }

    const message = allItemsFullyReceived
      ? `Order fully received and verified with ${createdDiscrepancies.length} discrepancy(ies)`
      : `Partial receipt recorded - ${partiallyVerifiedItems.length} item(s) still pending`;

    console.log(`✓ Order ${order.orderNumber}: ${message}`);

    res.status(200).json({
      success: true,
      message,
      data: {
        order,
        discrepancies: createdDiscrepancies,
        partiallyVerifiedItems,
        fullyReceived: allItemsFullyReceived
      }
    });
  } catch (error) {
    console.error('Verify order error:', error);
    next(error);
  }
};
exports.approveOrderDiscrepancy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const discrepancy = await OrderDiscrepancy.findById(id);
    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Discrepancy not found'
      });
    }
    if (discrepancy.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Discrepancy is already ${discrepancy.status}`
      });
    }
    await discrepancy.approve(req.user._id, notes);
    if (!discrepancy.stockProcessed) {
      const movementType = discrepancy.discrepancyType === 'Shortage' ? 'OUT' : 'IN';
      const movementQty = Math.abs(discrepancy.discrepancyQuantity);
      await StockMovement.create({
        sku: discrepancy.sku,
        type: movementType,
        qty: movementQty,
        refType: 'ORDER_DISCREPANCY',
        refId: discrepancy._id,
        sourceRef: `Order ${discrepancy.orderNumber} - ${discrepancy.discrepancyType}`,
        timestamp: new Date(),
        notes: `Order discrepancy: ${discrepancy.discrepancyType} of ${movementQty} units`,
        createdBy: req.user._id
      });
      const stockSummary = await StockSummary.findOne({ sku: discrepancy.sku });
      if (stockSummary) {
        if (movementType === 'IN') {
          stockSummary.addStock(movementQty);
        } else {
          stockSummary.removeStock(movementQty);
        }
        await stockSummary.save();
      }
      discrepancy.stockProcessed = true;
      await discrepancy.save();
      console.log(`✓ Order discrepancy ${id} approved and stock adjusted`);
    }
    res.status(200).json({
      success: true,
      message: 'Discrepancy approved and stock adjusted',
      data: discrepancy
    });
  } catch (error) {
    console.error('Approve order discrepancy error:', error);
    next(error);
  }
};
exports.rejectOrderDiscrepancy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const discrepancy = await OrderDiscrepancy.findById(id);
    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Discrepancy not found'
      });
    }
    if (discrepancy.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Discrepancy is already ${discrepancy.status}`
      });
    }
    await discrepancy.reject(req.user._id, notes);
    console.log(`✓ Order discrepancy ${id} rejected`);
    res.status(200).json({
      success: true,
      message: 'Discrepancy rejected',
      data: discrepancy
    });
  } catch (error) {
    console.error('Reject order discrepancy error:', error);
    next(error);
  }
};
exports.getOrderDiscrepancyById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const discrepancy = await OrderDiscrepancy.findById(id)
      .populate('reportedBy', 'username fullName email')
      .populate('resolvedBy', 'username fullName email')
      .populate('orderId', 'orderNumber orderDate status vendor');
    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Discrepancy not found'
      });
    }
    res.status(200).json({
      success: true,
      data: discrepancy
    });
  } catch (error) {
    console.error('Get order discrepancy by ID error:', error);
    next(error);
  }
};
exports.getOrderDiscrepancyStats = async (req, res, next) => {
  try {
    const [
      totalDiscrepancies,
      pendingDiscrepancies,
      approvedDiscrepancies,
      rejectedDiscrepancies,
      shortages,
      overages
    ] = await Promise.all([
      OrderDiscrepancy.countDocuments(),
      OrderDiscrepancy.countDocuments({ status: 'pending' }),
      OrderDiscrepancy.countDocuments({ status: 'approved' }),
      OrderDiscrepancy.countDocuments({ status: 'rejected' }),
      OrderDiscrepancy.countDocuments({ discrepancyType: 'Shortage' }),
      OrderDiscrepancy.countDocuments({ discrepancyType: 'Overage' })
    ]);
    res.status(200).json({
      success: true,
      data: {
        total: totalDiscrepancies,
        pending: pendingDiscrepancies,
        approved: approvedDiscrepancies,
        rejected: rejectedDiscrepancies,
        shortages,
        overages
      }
    });
  } catch (error) {
    console.error('Get order discrepancy stats error:', error);
    next(error);
  }
};
