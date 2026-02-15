const express = require('express');
const router = express.Router();
const CustomerConnectSyncService = require('../services/customerConnectSync.service');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const { authenticate, requireAdmin } = require('../middleware/auth');






router.post('/sync/orders', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    let { limit = 0, direction = 'new' } = req.body;

    
    if (limit === 0 || limit === null || limit === 'auto') {
      
      const highestOrder = await CustomerConnectOrder.findOne()
        .sort({ orderNumber: -1 })
        .select('orderNumber')
        .lean();

      if (highestOrder) {
        console.log(`📊 Last stored order: #${highestOrder.orderNumber}`);
        console.log(`🔄 Syncing NEW orders since #${highestOrder.orderNumber}...`);
      } else {
        console.log(`📊 No orders in database. Starting fresh sync...`);
      }

      
      limit = Infinity;
    } else if (limit === 'Infinity' || limit === Infinity) {
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
        .sort({ orderNumber: -1 })
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






router.get('/items/grouped', authenticate, requireAdmin(), async (req, res) => {
  try {
    
    const groupedItems = await CustomerConnectOrder.aggregate([
      
      { $unwind: '$items' },

      
      {
        $group: {
          _id: {
            sku: '$items.sku',
            name: '$items.name'
          },
          totalQuantity: { $sum: '$items.qty' },
          totalValue: { $sum: '$items.lineTotal' },
          avgUnitPrice: { $avg: '$items.unitPrice' },
          orderCount: { $sum: 1 },
          orders: {
            $push: {
              orderNumber: '$orderNumber',
              poNumber: '$poNumber',
              orderDate: '$orderDate',
              status: '$status',
              vendor: '$vendor.name',
              qty: '$items.qty',
              unitPrice: '$items.unitPrice',
              lineTotal: '$items.lineTotal',
              stockProcessed: '$stockProcessed'
            }
          }
        }
      },

      
      { $sort: { '_id.name': 1 } },

      
      {
        $project: {
          _id: 0,
          sku: '$_id.sku',
          name: '$_id.name',
          totalQuantity: 1,
          totalValue: 1,
          avgUnitPrice: 1,
          orderCount: 1,
          orders: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        items: groupedItems,
        totalItems: groupedItems.length
      }
    });
  } catch (error) {
    console.error('Get grouped items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch grouped items',
      error: error.message
    });
  }
});






router.post('/orders/bulk-delete', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { skus } = req.body;

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of SKUs to delete'
      });
    }

    console.log(`[Bulk Delete] Deleting orders with SKUs: ${skus.join(', ')}`);

    
    const result = await CustomerConnectOrder.deleteMany({
      'items.sku': { $in: skus }
    });

    console.log(`[Bulk Delete] Deleted ${result.deletedCount} orders`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} orders containing the specified SKUs`,
      data: {
        deletedCount: result.deletedCount,
        skus: skus
      }
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete orders',
      error: error.message
    });
  }
});






router.post('/orders/bulk-delete-by-numbers', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { orderNumbers } = req.body;

    if (!orderNumbers || !Array.isArray(orderNumbers) || orderNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of order numbers to delete'
      });
    }

    console.log(`[Bulk Delete Orders] Deleting orders with numbers: ${orderNumbers.join(', ')}`);

    
    const result = await CustomerConnectOrder.deleteMany({
      orderNumber: { $in: orderNumbers }
    });

    console.log(`[Bulk Delete Orders] Deleted ${result.deletedCount} orders`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} orders`,
      data: {
        deletedCount: result.deletedCount,
        orderNumbers: orderNumbers
      }
    });
  } catch (error) {
    console.error('Bulk delete orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete orders',
      error: error.message
    });
  }
});






router.get('/items/:sku/orders', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { sku } = req.params;

    console.log(`[getOrdersBySKU] Looking for SKU: ${sku}`);

    
    const orders = await CustomerConnectOrder.find({
      'items.sku': { $regex: new RegExp(`^${sku}$`, 'i') }
    }).sort({ orderNumber: -1 }).lean();

    console.log(`[getOrdersBySKU] Found ${orders.length} orders`);

    
    const orderEntries = orders.map(order => {
      const matchingItems = order.items.filter(item =>
        item.sku.toLowerCase() === sku.toLowerCase()
      );

      return matchingItems.map(item => ({
        orderNumber: order.orderNumber,
        poNumber: order.poNumber,
        orderDate: order.orderDate,
        status: order.status,
        vendor: order.vendor?.name || 'N/A',
        sku: item.sku,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        stockProcessed: order.stockProcessed
      }));
    }).flat();

    console.log(`[getOrdersBySKU] Extracted ${orderEntries.length} matching entries`);

    res.json({
      success: true,
      data: {
        sku: sku,
        entries: orderEntries,
        totalOrders: orders.length,
        totalQuantity: orderEntries.reduce((sum, entry) => sum + entry.qty, 0)
      }
    });
  } catch (error) {
    console.error('Get orders by SKU error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders for SKU',
      error: error.message
    });
  }
});






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
