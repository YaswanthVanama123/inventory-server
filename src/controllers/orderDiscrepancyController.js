const OrderDiscrepancy = require('../models/OrderDiscrepancy');
const PurchaseOrder = require('../models/PurchaseOrder');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');


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
    const order = await CustomerConnectOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    if (order.verified) {
      return res.status(400).json({
        success: false,
        message: 'Order has already been verified'
      });
    }
    const createdDiscrepancies = [];
    if (allGood) {
      console.log(`✓ Order ${order.orderNumber} verified - All Good`);
      order.verified = true;
      order.verifiedAt = new Date();
      order.verifiedBy = req.user._id;
      await order.save();
      return res.status(200).json({
        success: true,
        message: 'Order verified successfully - all items correct',
        data: {
          order,
          discrepancies: []
        }
      });
    }
    for (const item of items) {
      const expectedQuantity = parseFloat(item.expectedQuantity);
      const receivedQuantity = parseFloat(item.receivedQuantity);
      if (receivedQuantity !== expectedQuantity) {
        const discrepancy = await OrderDiscrepancy.createDiscrepancy({
          orderId: order._id,
          orderNumber: order.orderNumber,
          sku: item.sku,
          itemName: item.itemName,
          expectedQuantity,
          receivedQuantity,
          reportedBy: req.user._id,
          notes: item.notes || notes,
          status: 'pending' 
        });
        createdDiscrepancies.push(discrepancy);
        console.log(`  ✗ Discrepancy found for ${item.sku}: Expected ${expectedQuantity}, Received ${receivedQuantity}`);
      }
    }
    order.verified = true;
    order.verifiedAt = new Date();
    order.verifiedBy = req.user._id;
    await order.save();
    console.log(`✓ Order ${order.orderNumber} verified with ${createdDiscrepancies.length} discrepancies`);
    res.status(200).json({
      success: true,
      message: `Order verified with ${createdDiscrepancies.length} discrepancy(ies)`,
      data: {
        order,
        discrepancies: createdDiscrepancies
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
