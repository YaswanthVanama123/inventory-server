const express = require('express');
const router = express.Router();
const RouteStarSyncService = require('../services/routeStarSync.service');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarItem = require('../models/RouteStarItem');
const FetchHistory = require('../models/FetchHistory');
const { authenticate, requireAdmin } = require('../middleware/auth');






router.post('/sync/items', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;
  let fetchRecord = null;

  try {
    let { limit = 0 } = req.body;

    // Create fetch history record
    fetchRecord = await FetchHistory.startFetch('routestar_items', 'items', {
      limit: limit,
      triggeredBy: req.body.triggeredBy || 'manual'
    });


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

    // Mark fetch as completed
    await fetchRecord.markCompleted({
      totalFetched: results.total || 0,
      created: results.created || 0,
      updated: results.updated || 0
    });

    console.log(`\n========================================`);
    console.log(`Items sync completed successfully`);
    console.log(`========================================\n`);

    res.json({
      success: true,
      message: `Items synced successfully (${limit === Infinity ? 'all' : limit} items requested)`,
      data: results,
      fetchId: fetchRecord._id
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ ITEMS SYNC ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    // Mark fetch as failed
    if (fetchRecord) {
      await fetchRecord.markFailed(error.message, { stack: error.stack });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to sync items',
      error: error.message,
      fetchId: fetchRecord?._id
    });
  } finally {
    if (syncService) {
      console.log('Closing sync service...');
      await syncService.close();
      console.log('Sync service closed\n');
    }
  }
});






router.post('/sync/pending', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;
  let fetchRecord = null;

  try {
    let { limit = 0, direction = 'new' } = req.body;

    // Create fetch history record
    fetchRecord = await FetchHistory.startFetch('routestar_invoices', 'pending', {
      limit: limit,
      direction: direction,
      triggeredBy: req.body.triggeredBy || 'manual'
    });


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

    // Mark fetch as completed
    await fetchRecord.markCompleted({
      totalFetched: results.total || 0,
      created: results.created || 0,
      updated: results.updated || 0
    });

    const limitText = limit === Infinity ? 'all available' : limit;

    console.log(`\n========================================`);
    console.log(`Pending invoices sync completed successfully`);
    console.log(`========================================\n`);

    res.json({
      success: true,
      message: `Pending invoices synced successfully (${limitText} ${direction} invoices requested)`,
      data: results,
      fetchId: fetchRecord._id
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ PENDING INVOICES SYNC ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    // Mark fetch as failed
    if (fetchRecord) {
      await fetchRecord.markFailed(error.message, { stack: error.stack });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to sync pending invoices',
      error: error.message,
      fetchId: fetchRecord?._id
    });
  } finally {
    if (syncService) {
      console.log('Closing sync service...');
      await syncService.close();
      console.log('Sync service closed\n');
    }
  }
});






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






router.post('/sync/closed', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;
  let fetchRecord = null;

  try {
    let { limit = 0, direction = 'new' } = req.body;

    // Create fetch history record
    fetchRecord = await FetchHistory.startFetch('routestar_invoices', 'closed', {
      limit: limit,
      direction: direction,
      triggeredBy: req.body.triggeredBy || 'manual'
    });


    if (limit === 0 || limit === null || limit === 'Infinity' || limit === Infinity) {
      limit = Infinity;
    } else {
      limit = parseInt(limit);
    }

    syncService = new RouteStarSyncService();
    await syncService.init();

    const results = await syncService.syncClosedInvoices(limit);

    // Mark fetch as completed
    await fetchRecord.markCompleted({
      totalFetched: results.total || 0,
      created: results.created || 0,
      updated: results.updated || 0
    });

    const limitText = limit === Infinity ? 'all available' : limit;

    res.json({
      success: true,
      message: `Closed invoices synced successfully (${limitText} ${direction} invoices requested)`,
      data: results,
      fetchId: fetchRecord._id
    });
  } catch (error) {
    console.error('Closed invoices sync error:', error);

    // Mark fetch as failed
    if (fetchRecord) {
      await fetchRecord.markFailed(error.message, { stack: error.stack });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to sync closed invoices',
      error: error.message,
      fetchId: fetchRecord?._id
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});






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


router.post('/sync/pending-details', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const { limit = 0 } = req.body;

    console.log('\n========================================');
    console.log('Starting sync pending invoice details request');
    console.log(`Limit: ${limit === 0 ? 'Infinity' : limit}`);
    console.log('========================================\n');

    console.log('Created sync service, initializing...');
    syncService = new RouteStarSyncService();
    await syncService.init();

    console.log('Sync service initialized, starting sync...');
    const results = await syncService.syncAllInvoiceDetails(limit, 'Pending');

    console.log('\n========================================');
    console.log('Pending invoice details sync completed successfully');
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Pending invoice details synced successfully',
      data: results
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ PENDING INVOICE DETAILS SYNC ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Failed to sync pending invoice details',
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


router.post('/sync/closed-details', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    const { limit = 0 } = req.body;

    console.log('\n========================================');
    console.log('Starting sync closed invoice details request');
    console.log(`Limit: ${limit === 0 ? 'Infinity' : limit}`);
    console.log('========================================\n');

    console.log('Created sync service, initializing...');
    syncService = new RouteStarSyncService();
    await syncService.init();

    console.log('Sync service initialized, starting sync...');
    const results = await syncService.syncAllInvoiceDetails(limit, 'Closed');

    console.log('\n========================================');
    console.log('Closed invoice details sync completed successfully');
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Closed invoice details synced successfully',
      data: results
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ CLOSED INVOICE DETAILS SYNC ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Failed to sync closed invoice details',
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


    const invoiceResults = await syncService.syncPendingInvoices(limit, direction);
    console.log(`\nStep 1 complete: ${invoiceResults.created} created, ${invoiceResults.updated} updated`);


    const detailsResults = await syncService.syncAllInvoiceDetails(0, 'Pending');
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


    const invoiceResults = await syncService.syncClosedInvoices(limit, direction);
    console.log(`\nStep 1 complete: ${invoiceResults.created} created, ${invoiceResults.updated} updated`);


    const detailsResults = await syncService.syncAllInvoiceDetails(0, 'Closed');
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


router.get('/check-pending', authenticate, requireAdmin(), async (req, res) => {
  let syncService = null;

  try {
    console.log('\n========================================');
    console.log('Checking pending invoices in RouteStar');
    console.log('========================================\n');

    syncService = new RouteStarSyncService();
    await syncService.init();

    const result = await syncService.checkPendingInvoicesInRouteStar();

    console.log('\n========================================');
    console.log('Check completed successfully');
    console.log('========================================\n');

    res.json({
      success: true,
      message: 'Pending invoices check completed',
      data: result
    });
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ CHECK PENDING INVOICES ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Failed to check pending invoices',
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






router.get('/items/grouped', authenticate, requireAdmin(), async (req, res) => {
  try {
    console.log('[getGroupedRouteStarItems] Starting aggregation...');

    const RouteStarItemAlias = require('../models/RouteStarItemAlias');

    
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    console.log(`[getGroupedRouteStarItems] Loaded ${Object.keys(aliasMap).length} aliases`);

    
    const groupedItems = await RouteStarInvoice.aggregate([
      
      { $match: { 'lineItems.0': { $exists: true } } },

      
      { $unwind: '$lineItems' },

      
      { $match: { 'lineItems.name': { $exists: true, $ne: null, $ne: '' } } },

      
      {
        $group: {
          _id: {
            name: '$lineItems.name',
            sku: { $ifNull: ['$lineItems.sku', '$lineItems.name'] } 
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

      
      { $sort: { '_id.name': 1 } },

      
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

    console.log(`[getGroupedRouteStarItems] Found ${groupedItems.length} initial grouped items`);

    
    const mergedItems = {};

    groupedItems.forEach(item => {
      
      const canonicalName = aliasMap[item.name] || item.name;

      if (!mergedItems[canonicalName]) {
        mergedItems[canonicalName] = {
          sku: item.sku,
          name: canonicalName,
          originalNames: [item.name],
          totalQuantity: 0,
          totalValue: 0,
          avgUnitPrice: 0,
          invoiceCount: 0,
          invoices: []
        };
      }

      
      const merged = mergedItems[canonicalName];
      if (!merged.originalNames.includes(item.name)) {
        merged.originalNames.push(item.name);
      }
      merged.totalQuantity += item.totalQuantity;
      merged.totalValue += item.totalValue;
      merged.invoiceCount += item.invoiceCount;
      merged.invoices.push(...item.invoices);

      
      const totalRate = merged.invoices.reduce((sum, inv) => sum + (inv.rate || 0), 0);
      merged.avgUnitPrice = merged.invoices.length > 0 ? totalRate / merged.invoices.length : 0;
    });

    
    const finalItems = Object.values(mergedItems).sort((a, b) => a.name.localeCompare(b.name));

    console.log(`[getGroupedRouteStarItems] After merging: ${finalItems.length} items (merged ${groupedItems.length - finalItems.length} aliases)`);

    res.json({
      success: true,
      data: {
        items: finalItems,
        totalItems: finalItems.length,
        aliasesApplied: Object.keys(aliasMap).length,
        itemsMerged: groupedItems.length - finalItems.length
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
