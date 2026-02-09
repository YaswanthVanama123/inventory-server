const express = require('express');
const router = express.Router();
const CustomerConnectSyncService = require('../services/customerConnectSync.service');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * @route   POST /api/customerconnect/sync/orders
 * @desc    Sync orders from CustomerConnect
 * @access  Private (Admin only)
 */
router.post('/sync/orders', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    let { limit = 100, direction = 'new' } = req.body;

    // Handle unlimited sync
    if (limit === 0 || limit === null || limit === 'Infinity' || limit === Infinity) {
      limit = Infinity;
    } else {
      limit = parseInt(limit);
    }

    syncService = new CustomerConnectSyncService();
    await syncService.init();

    const results = await syncService.syncOrders(limit);

    const limitText = limit === Infinity ? 'all available' : limit;

    res.json({
      success: true,
      message: `Orders synced successfully (${limitText} ${direction} orders requested)`,
      data: results
    });
  } catch (error) {
    console.error('Orders sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync orders',
      error: error.message
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});

/**
 * @route   GET /api/customerconnect/order-range
 * @desc    Get the highest and lowest order numbers in the database
 * @access  Private (Admin only)
 */
router.get('/order-range', authenticate, requireAdmin(), async (req, res) => {
  try {
    const highestOrder = await CustomerConnectOrder.findOne()
      .sort({ orderNumber: -1 })
      .select('orderNumber orderDate')
      .lean();

    const lowestOrder = await CustomerConnectOrder.findOne()
      .sort({ orderNumber: 1 })
      .select('orderNumber orderDate')
      .lean();

    const totalOrders = await CustomerConnectOrder.countDocuments();

    res.json({
      success: true,
      data: {
        highest: highestOrder?.orderNumber || null,
        lowest: lowestOrder?.orderNumber || null,
        highestDate: highestOrder?.orderDate || null,
        lowestDate: lowestOrder?.orderDate || null,
        totalOrders
      }
    });
  } catch (error) {
    console.error('Get order range error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order range',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/customerconnect/sync/details/:orderNumber
 * @desc    Sync detailed line items for a specific order
 * @access  Private
 */
router.post('/sync/details/:orderNumber', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const { orderNumber } = req.params;

    syncService = new CustomerConnectSyncService();
    await syncService.init();

    const order = await syncService.syncOrderDetails(orderNumber);

    res.json({
      success: true,
      message: 'Order details synced successfully',
      data: order
    });
  } catch (error) {
    console.error('Order details sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync order details',
      error: error.message
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});

/**
 * @route   POST /api/customerconnect/sync/all-details
 * @desc    Sync details for all orders missing line items
 * @access  Private
 */
router.post('/sync/all-details', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const { limit = 50 } = req.body;

    syncService = new CustomerConnectSyncService();
    await syncService.init();

    const results = await syncService.syncAllOrderDetails(limit);

    res.json({
      success: true,
      message: 'All order details synced successfully',
      data: results
    });
  } catch (error) {
    console.error('All order details sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync all order details',
      error: error.message
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});

/**
 * @route   POST /api/customerconnect/sync/stock
 * @desc    Process stock movements for completed orders (ADD to inventory)
 * @access  Private
 */
router.post('/sync/stock', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    syncService = new CustomerConnectSyncService();
    await syncService.init();

    const results = await syncService.processStockMovements();

    res.json({
      success: true,
      message: 'Stock movements processed successfully',
      data: results
    });
  } catch (error) {
    console.error('Stock movements error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process stock movements',
      error: error.message
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});

/**
 * @route   POST /api/customerconnect/sync/full
 * @desc    Full sync: orders + order details + stock movements
 * @access  Private
 */
router.post('/sync/full', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const {
      ordersLimit = 100,
      detailsLimit = 50,
      processStock = true
    } = req.body;

    syncService = new CustomerConnectSyncService();
    await syncService.init();

    const results = await syncService.fullSync({
      ordersLimit,
      detailsLimit,
      processStock
    });

    res.json({
      success: true,
      message: 'Full sync completed successfully',
      data: results
    });
  } catch (error) {
    console.error('Full sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete full sync',
      error: error.message
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});

/**
 * @route   GET /api/customerconnect/orders
 * @desc    Get all CustomerConnect orders with filters
 * @access  Private
 */
router.get('/orders', authenticate, requireAdmin(), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      vendor,
      startDate,
      endDate,
      stockProcessed
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (vendor) query['vendor.name'] = new RegExp(vendor, 'i');
    if (stockProcessed !== undefined) query.stockProcessed = stockProcessed === 'true';

    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate) query.orderDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      CustomerConnectOrder.find(query)
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      CustomerConnectOrder.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/customerconnect/orders/:orderNumber
 * @desc    Get a specific order by order number
 * @access  Private
 */
router.get('/orders/:orderNumber', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const order = await CustomerConnectOrder.findByOrderNumber(orderNumber);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/customerconnect/stats
 * @desc    Get purchase statistics
 * @access  Private
 */
router.get('/stats', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { startDate, endDate, vendor } = req.query;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await CustomerConnectOrder.getPurchaseStats(start, end, { vendor });
    const topVendors = await CustomerConnectOrder.getTopVendors(start, end, 10);
    const topProducts = await CustomerConnectOrder.getTopProducts(start, end, 10);

    
    const statusCounts = await CustomerConnectOrder.aggregate([
      {
        $match: {
          orderDate: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        dateRange: { start, end },
        purchases: stats,
        topVendors,
        topProducts,
        statusBreakdown: statusCounts
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/customerconnect/orders/all
 * @desc    Delete ALL CustomerConnect orders (for testing/cleanup)
 * @access  Private (Admin only)
 */
router.delete('/orders/all', authenticate, requireAdmin(), async (req, res) => {
  try {
    const count = await CustomerConnectOrder.countDocuments();

    if (count === 0) {
      return res.json({
        success: true,
        message: 'No orders to delete',
        data: { deletedCount: 0 }
      });
    }

    const result = await CustomerConnectOrder.deleteMany({});

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} orders`,
      data: { deletedCount: result.deletedCount }
    });
  } catch (error) {
    console.error('Delete all orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete orders',
      error: error.message
    });
  }
});

module.exports = router;
