const express = require('express');
const router = express.Router();
const RouteStarSyncService = require('../services/routeStarSync.service');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarItem = require('../models/RouteStarItem');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * @route   POST /api/routestar/sync/items
 * @desc    Sync items from RouteStar
 * @access  Private
 */
router.post('/sync/items', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    let { limit = 0 } = req.body;

    // Handle unlimited/auto-detect sync
    if (limit === 0 || limit === null || limit === 'Infinity' || limit === Infinity) {
      limit = Infinity;
    } else {
      limit = parseInt(limit);
    }

    console.log(`\n========================================`);
    console.log(`Starting items sync request`);
    console.log(`Limit: ${limit === Infinity ? 'Infinity' : limit}`);
    console.log(`========================================\n`);

    syncService = new RouteStarSyncService();
    console.log('Created sync service, initializing...');
    await syncService.init();
    console.log('Sync service initialized, starting items sync...');

    const results = await syncService.syncItems(limit);

    console.log(`\n========================================`);
    console.log(`Items sync completed successfully`);
    console.log(`========================================\n`);

    res.json({
      success: true,
      message: `Items synced successfully (${limit === Infinity ? 'all' : limit} items requested)`,
      data: results
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ ITEMS SYNC ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Failed to sync items',
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
 * @route   POST /api/routestar/sync/pending
 * @desc    Sync pending invoices from RouteStar
 * @access  Private
 */
router.post('/sync/pending', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    let { limit = 0, direction = 'new' } = req.body;

    // Handle unlimited/auto-detect sync
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
    let { limit = 0, direction = 'new' } = req.body;

    // Handle unlimited/auto-detect sync
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
 * @route   POST /api/routestar/sync/all-details
 * @desc    Sync detailed line items for all invoices without details
 * @access  Private
 */
router.post('/sync/all-details', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const { limit = 0 } = req.body;

    console.log('\n========================================');
    console.log('Starting sync all invoice details request');
    console.log(`Limit: ${limit === 0 ? 'Infinity' : limit}`);
    console.log('========================================\n');

    console.log('Created sync service, initializing...');
    syncService = new RouteStarSyncService();
    await syncService.init();

    console.log('Sync service initialized, starting sync...');
    const results = await syncService.syncAllInvoiceDetails(limit);

    console.log('\n========================================');
    console.log('Invoice details sync completed successfully');
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Invoice details synced successfully',
      data: results
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ INVOICE DETAILS SYNC ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Failed to sync invoice details',
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
 * @route   POST /api/routestar/sync/pending-with-details
 * @desc    Sync pending invoices with their details (keeps browser open)
 * @access  Private
 */
router.post('/sync/pending-with-details', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const { limit = 0, direction = 'new' } = req.body;

    console.log('\n========================================');
    console.log('Starting pending invoices + details sync');
    console.log(`Limit: ${limit === 0 ? 'Infinity' : limit}, Direction: ${direction}`);
    console.log('========================================\n');

    console.log('Created sync service, initializing...');
    syncService = new RouteStarSyncService();
    await syncService.init();

    console.log('Sync service initialized, starting sync...');

    // Step 1: Sync pending invoices
    const invoiceResults = await syncService.syncPendingInvoices(limit, direction);
    console.log(`\nStep 1 complete: ${invoiceResults.created} created, ${invoiceResults.updated} updated`);

    // Step 2: Sync invoice details (reusing same browser session)
    const detailsResults = await syncService.syncAllInvoiceDetails(0);
    console.log(`\nStep 2 complete: ${detailsResults.synced} details synced`);

    console.log('\n========================================');
    console.log('Pending invoices + details sync completed successfully');
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Pending invoices and details synced successfully',
      data: {
        invoices: invoiceResults,
        details: detailsResults
      }
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ PENDING + DETAILS SYNC ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Failed to sync pending invoices and details',
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
 * @route   POST /api/routestar/sync/closed-with-details
 * @desc    Sync closed invoices with their details (keeps browser open)
 * @access  Private
 */
router.post('/sync/closed-with-details', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const { limit = 0, direction = 'new' } = req.body;

    console.log('\n========================================');
    console.log('Starting closed invoices + details sync');
    console.log(`Limit: ${limit === 0 ? 'Infinity' : limit}, Direction: ${direction}`);
    console.log('========================================\n');

    console.log('Created sync service, initializing...');
    syncService = new RouteStarSyncService();
    await syncService.init();

    console.log('Sync service initialized, starting sync...');

    // Step 1: Sync closed invoices
    const invoiceResults = await syncService.syncClosedInvoices(limit, direction);
    console.log(`\nStep 1 complete: ${invoiceResults.created} created, ${invoiceResults.updated} updated`);

    // Step 2: Sync invoice details (reusing same browser session)
    const detailsResults = await syncService.syncAllInvoiceDetails(0);
    console.log(`\nStep 2 complete: ${detailsResults.synced} details synced`);

    console.log('\n========================================');
    console.log('Closed invoices + details sync completed successfully');
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Closed invoices and details synced successfully',
      data: {
        invoices: invoiceResults,
        details: detailsResults
      }
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ CLOSED + DETAILS SYNC ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Failed to sync closed invoices and details',
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

/**
 * @route   GET /api/routestar/items/grouped
 * @desc    Get grouped items from all RouteStar invoices (pending and closed)
 * @access  Private (Admin only)
 */
router.get('/items/grouped', authenticate, requireAdmin(), async (req, res) => {
  try {
    console.log('[getGroupedRouteStarItems] Starting aggregation...');

    // Aggregate all line items across all RouteStar invoices (pending and closed)
    const groupedItems = await RouteStarInvoice.aggregate([
      // Only include invoices with line items
      { $match: { 'lineItems.0': { $exists: true } } },

      // Unwind line items array to get individual items
      { $unwind: '$lineItems' },

      // Filter out items without name
      { $match: { 'lineItems.name': { $exists: true, $ne: null, $ne: '' } } },

      // Group by name (and SKU if available)
      {
        $group: {
          _id: {
            name: '$lineItems.name',
            sku: { $ifNull: ['$lineItems.sku', '$lineItems.name'] } // Use name as fallback if no SKU
          },
          totalQuantity: { $sum: '$lineItems.quantity' },
          totalValue: { $sum: '$lineItems.amount' },
          avgUnitPrice: { $avg: '$lineItems.rate' },
          invoiceCount: { $sum: 1 },
          invoices: {
            $push: {
              invoiceId: '$_id',
              invoiceNumber: '$invoiceNumber',
              invoiceDate: '$invoiceDate',
              invoiceType: '$invoiceType',
              customerName: '$customer.name',
              quantity: '$lineItems.quantity',
              rate: '$lineItems.rate',
              amount: '$lineItems.amount',
              status: '$status',
              stockProcessed: '$stockProcessed'
            }
          }
        }
      },

      // Sort by item name
      { $sort: { '_id.name': 1 } },

      // Project to clean format
      {
        $project: {
          _id: 0,
          sku: '$_id.sku',
          name: '$_id.name',
          totalQuantity: 1,
          totalValue: 1,
          avgUnitPrice: 1,
          invoiceCount: 1,
          invoices: 1
        }
      }
    ]);

    console.log(`[getGroupedRouteStarItems] Found ${groupedItems.length} grouped items`);

    res.json({
      success: true,
      data: {
        items: groupedItems,
        totalItems: groupedItems.length
      }
    });
  } catch (error) {
    console.error('Get grouped RouteStar items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch grouped items',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/routestar/invoices/bulk-delete
 * @desc    Delete all invoices containing the specified SKUs
 * @access  Private (Admin only)
 */
router.post('/invoices/bulk-delete', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { skus } = req.body;

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of SKUs to delete'
      });
    }

    console.log(`[Bulk Delete Invoices] Deleting invoices with SKUs: ${skus.join(', ')}`);

    // Delete all invoices that contain any of the specified SKUs in their line items
    const result = await RouteStarInvoice.deleteMany({
      'lineItems.sku': { $in: skus }
    });

    console.log(`[Bulk Delete Invoices] Deleted ${result.deletedCount} invoices`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} invoices containing the specified SKUs`,
      data: {
        deletedCount: result.deletedCount,
        skus: skus
      }
    });
  } catch (error) {
    console.error('Bulk delete invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete invoices',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/routestar/invoices/bulk-delete-by-numbers
 * @desc    Delete invoices by their invoice numbers
 * @access  Private (Admin only)
 */
router.post('/invoices/bulk-delete-by-numbers', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { invoiceNumbers } = req.body;

    if (!invoiceNumbers || !Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of invoice numbers to delete'
      });
    }

    console.log(`[Bulk Delete Invoices] Deleting invoices with numbers: ${invoiceNumbers.join(', ')}`);

    // Delete all invoices with the specified invoice numbers
    const result = await RouteStarInvoice.deleteMany({
      invoiceNumber: { $in: invoiceNumbers }
    });

    console.log(`[Bulk Delete Invoices] Deleted ${result.deletedCount} invoices`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} invoices`,
      data: {
        deletedCount: result.deletedCount,
        invoiceNumbers: invoiceNumbers
      }
    });
  } catch (error) {
    console.error('Bulk delete invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete invoices',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/routestar/items
 * @desc    Get all RouteStar items with filters
 * @access  Private
 */
router.get('/items', authenticate, requireAdmin(), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      category,
      department,
      type,
      inStock,
      searchTerm
    } = req.query;

    const query = {};

    if (category) query.category = category;
    if (department) query.department = department;
    if (type) query.type = type;
    if (inStock === 'true') query.qtyOnHand = { $gt: 0 };
    if (searchTerm) {
      query.$or = [
        { itemName: new RegExp(searchTerm, 'i') },
        { description: new RegExp(searchTerm, 'i') },
        { mfgPartNumber: new RegExp(searchTerm, 'i') }
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      RouteStarItem.find(query)
        .sort({ itemName: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      RouteStarItem.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/routestar/items/low-stock
 * @desc    Get low stock items
 * @access  Private
 */
router.get('/items/low-stock', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { threshold = 10 } = req.query;
    const items = await RouteStarItem.getLowStock(parseInt(threshold));

    res.json({
      success: true,
      data: {
        items,
        totalItems: items.length,
        threshold: parseInt(threshold)
      }
    });
  } catch (error) {
    console.error('Get low stock items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock items',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/routestar/items/all
 * @desc    Delete all items
 * @access  Private (Admin only)
 */
router.delete('/items/all', authenticate, requireAdmin(), async (req, res) => {
  try {
    const result = await RouteStarItem.deleteMany({});

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} items`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Delete all items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete items',
      error: error.message
    });
  }
});

module.exports = router;
