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

    const partiallyVerifiedItems = [];

    if (allGood) {
      console.log(`✓ Order ${order.orderNumber} verified - All Good (Fully Received)`);

      for (const item of order.items) {
        const previouslyReceived = item.receivedQuantity || 0;
        const receivingNow = item.qty - previouslyReceived;

        if (receivingNow > 0) {
          if (!item.verificationHistory) item.verificationHistory = [];
          item.verificationHistory.push({
            receivedQty: receivingNow,
            verifiedAt: new Date(),
            verifiedBy: req.user._id,
            notes: notes || 'All items received as expected',
            stockProcessed: false
          });

          item.receivedQuantity = item.qty;
          item.remainingQuantity = 0;
          item.itemVerified = true;
          item.itemVerifiedAt = new Date();
          item.itemVerifiedBy = req.user._id;

          try {
            await StockProcessor.processItemVerification(
              order,
              item,
              receivingNow,
              `${Date.now()}-allgood`,
              req.user._id
            );
            const lastIdx = item.verificationHistory.length - 1;
            item.verificationHistory[lastIdx].stockProcessed = true;
            item.verificationHistory[lastIdx].stockProcessedAt = new Date();
            console.log(`  ✓ Stock processed for ${item.sku}: +${receivingNow} units`);
          } catch (stockError) {
            console.error(`  ✗ Failed to process stock for ${item.sku}:`, stockError.message);
          }
        } else {
          item.itemVerified = true;
          item.itemVerifiedAt = item.itemVerifiedAt || new Date();
          item.itemVerifiedBy = item.itemVerifiedBy || req.user._id;
        }
      }

      order.verified = true;
      order.verifiedAt = new Date();
      order.verifiedBy = req.user._id;
      order.stockProcessed = true;
      order.stockProcessedAt = new Date();
      await order.save();

      return res.status(200).json({
        success: true,
        message: 'Order fully received and verified - stock processed',
        data: {
          order,
          discrepancies: [],
          partiallyVerifiedItems: [],
          fullyReceived: true
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
        notes: item.notes || notes || `Received ${receivingNow} units`,
        stockProcessed: false
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

      try {
        const verificationIndex = orderItem.verificationHistory.length - 1;
        await StockProcessor.processItemVerification(
          order,
          orderItem,
          receivingNow,
          `${Date.now()}-${verificationIndex}`,
          req.user._id
        );
        orderItem.verificationHistory[verificationIndex].stockProcessed = true;
        orderItem.verificationHistory[verificationIndex].stockProcessedAt = new Date();
        console.log(`  ✓ Stock processed for ${item.sku}: +${receivingNow} units`);
      } catch (stockError) {
        console.error(`  ✗ Failed to process stock for ${item.sku}:`, stockError.message);
      }
    }

    const allItemsFullyReceived = order.items.every(item => item.receivedQuantity >= item.qty);

    if (allItemsFullyReceived) {
      order.verified = true;
      order.verifiedAt = new Date();
      order.verifiedBy = req.user._id;
      order.stockProcessed = true;
      order.stockProcessedAt = new Date();
    }

    await order.save();

    const message = allItemsFullyReceived
      ? 'Order fully received and verified'
      : `Partial receipt recorded - ${partiallyVerifiedItems.length} item(s) still pending`;

    console.log(`✓ Order ${order.orderNumber}: ${message}`);

    res.status(200).json({
      success: true,
      message,
      data: {
        order,
        discrepancies: [],
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

exports.deleteOrderDiscrepancy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const discrepancy = await OrderDiscrepancy.findById(id);
    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Order discrepancy not found'
      });
    }
    await discrepancy.deleteOne();
    res.status(200).json({
      success: true,
      message: 'Order discrepancy deleted successfully'
    });
  } catch (error) {
    console.error('Delete order discrepancy error:', error);
    next(error);
  }
};
