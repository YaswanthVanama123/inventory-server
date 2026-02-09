const express = require('express');
const router = express.Router();
const RouteStarSyncService = require('../services/routeStarSync.service');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * @route   POST /api/routestar/sync/pending
 * @desc    Sync pending invoices from RouteStar
 * @access  Private
 */
router.post('/sync/pending', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    let { limit = 100, direction = 'new' } = req.body;

    // Handle unlimited sync
    if (limit === 0 || limit === null || limit === 'Infinity' || limit === Infinity) {
      limit = Infinity;
    } else {
      limit = parseInt(limit);
    }

    console.log(`\n========================================`);
    console.log(`Starting pending invoices sync request`);
    console.log(`Limit: ${limit}, Direction: ${direction}`);
    console.log(`========================================\n`);

    syncService = new RouteStarSyncService();
    console.log('Created sync service, initializing...');
    await syncService.init();
    console.log('Sync service initialized, starting sync...');

    const results = await syncService.syncPendingInvoices(limit);

    const limitText = limit === Infinity ? 'all available' : limit;

    console.log(`\n========================================`);
    console.log(`Pending invoices sync completed successfully`);
    console.log(`========================================\n`);

    res.json({
      success: true,
      message: `Pending invoices synced successfully (${limitText} ${direction} invoices requested)`,
      data: results
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ PENDING INVOICES SYNC ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Failed to sync pending invoices',
      error: error.message
    });
  } finally {
    if (syncService) {
      console.log('Closing sync service...');
      await syncService.close();
      console.log('Sync service closed\n');
    }
  }
});

/**
 * @route   GET /api/routestar/invoice-range
 * @desc    Get the highest and lowest invoice numbers in the database
 * @access  Private (Admin only)
 */
router.get('/invoice-range', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { invoiceType } = req.query;

    const query = invoiceType ? { invoiceType } : {};

    const highestInvoice = await RouteStarInvoice.findOne(query)
      .sort({ invoiceNumber: -1 })
      .select('invoiceNumber invoiceDate invoiceType')
      .lean();

    const lowestInvoice = await RouteStarInvoice.findOne(query)
      .sort({ invoiceNumber: 1 })
      .select('invoiceNumber invoiceDate invoiceType')
      .lean();

    const totalInvoices = await RouteStarInvoice.countDocuments(query);

    res.json({
      success: true,
      data: {
        highest: highestInvoice?.invoiceNumber || null,
        lowest: lowestInvoice?.invoiceNumber || null,
        highestDate: highestInvoice?.invoiceDate || null,
        lowestDate: lowestInvoice?.invoiceDate || null,
        totalInvoices,
        invoiceType: invoiceType || 'all'
      }
    });
  } catch (error) {
    console.error('Get invoice range error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get invoice range',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/routestar/sync/closed
 * @desc    Sync closed invoices from RouteStar
 * @access  Private
 */
router.post('/sync/closed', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    let { limit = 100, direction = 'new' } = req.body;

    // Handle unlimited sync
    if (limit === 0 || limit === null || limit === 'Infinity' || limit === Infinity) {
      limit = Infinity;
    } else {
      limit = parseInt(limit);
    }

    syncService = new RouteStarSyncService();
    await syncService.init();

    const results = await syncService.syncClosedInvoices(limit);

    const limitText = limit === Infinity ? 'all available' : limit;

    res.json({
      success: true,
      message: `Closed invoices synced successfully (${limitText} ${direction} invoices requested)`,
      data: results
    });
  } catch (error) {
    console.error('Closed invoices sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync closed invoices',
      error: error.message
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});

/**
 * @route   POST /api/routestar/sync/details/:invoiceNumber
 * @desc    Sync detailed line items for a specific invoice
 * @access  Private
 */
router.post('/sync/details/:invoiceNumber', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const { invoiceNumber } = req.params;

    syncService = new RouteStarSyncService();
    await syncService.init();

    const invoice = await syncService.syncInvoiceDetails(invoiceNumber);

    res.json({
      success: true,
      message: 'Invoice details synced successfully',
      data: invoice
    });
  } catch (error) {
    console.error('Invoice details sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync invoice details',
      error: error.message
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});

/**
 * @route   POST /api/routestar/sync/stock
 * @desc    Process stock movements for completed invoices
 * @access  Private
 */
router.post('/sync/stock', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    syncService = new RouteStarSyncService();
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
 * @route   POST /api/routestar/sync/full
 * @desc    Full sync: pending + closed invoices + stock movements
 * @access  Private
 */
router.post('/sync/full', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const {
      pendingLimit = 100,
      closedLimit = 100,
      processStock = true
    } = req.body;

    syncService = new RouteStarSyncService();
    await syncService.init();

    const results = await syncService.fullSync({
      pendingLimit,
      closedLimit,
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
 * @route   GET /api/routestar/invoices
 * @desc    Get all RouteStar invoices with filters
 * @access  Private
 */
router.get('/invoices', authenticate, requireAdmin(), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      invoiceType,
      status,
      customer,
      startDate,
      endDate,
      stockProcessed
    } = req.query;

    const query = {};

    if (invoiceType) query.invoiceType = invoiceType;
    if (status) query.status = status;
    if (customer) query['customer.name'] = new RegExp(customer, 'i');
    if (stockProcessed !== undefined) query.stockProcessed = stockProcessed === 'true';

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [invoices, total] = await Promise.all([
      RouteStarInvoice.find(query)
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      RouteStarInvoice.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/routestar/invoices/:invoiceNumber
 * @desc    Get a specific invoice by invoice number
 * @access  Private
 */
router.get('/invoices/:invoiceNumber', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    const invoice = await RouteStarInvoice.findByInvoiceNumber(invoiceNumber);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/routestar/stats
 * @desc    Get sales statistics
 * @access  Private
 */
router.get('/stats', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { startDate, endDate, customer, assignedTo } = req.query;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await RouteStarInvoice.getSalesStats(start, end, { customer, assignedTo });
    const topCustomers = await RouteStarInvoice.getTopCustomers(start, end, 10);

    
    const statusCounts = await RouteStarInvoice.aggregate([
      {
        $match: {
          invoiceDate: { $gte: start, $lte: end }
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
        sales: stats,
        topCustomers,
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
 * @route   DELETE /api/routestar/invoices/pending/all
 * @desc    Delete all pending invoices
 * @access  Private (Admin only)
 */
router.delete('/invoices/pending/all', authenticate, requireAdmin(), async (req, res) => {
  try {
    const result = await RouteStarInvoice.deleteMany({ invoiceType: 'pending' });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} pending invoices`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Delete all pending invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete pending invoices',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/routestar/invoices/closed/all
 * @desc    Delete all closed invoices
 * @access  Private (Admin only)
 */
router.delete('/invoices/closed/all', authenticate, requireAdmin(), async (req, res) => {
  try {
    const result = await RouteStarInvoice.deleteMany({ invoiceType: 'closed' });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} closed invoices`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Delete all closed invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete closed invoices',
      error: error.message
    });
  }
});

module.exports = router;
