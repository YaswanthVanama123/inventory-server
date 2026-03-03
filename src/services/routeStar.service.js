const RouteStarSyncService = require('./routeStarSync.service');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarItem = require('../models/RouteStarItem');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const FetchHistory = require('../models/FetchHistory');

class RouteStarService {
  /**
   * Sync items from RouteStar
   * @param {number} limit - Number of items to sync (0 or Infinity for all)
   * @param {string} triggeredBy - Who/what triggered the sync (default: 'manual')
   * @returns {Promise<Object>} - Sync results and fetchId
   */
  async syncItems(limit, triggeredBy = 'manual') {
    let syncService = null;
    let fetchRecord = null;

    try {
      // Create fetch history record
      fetchRecord = await FetchHistory.startFetch('routestar_items', 'items', {
        limit: limit,
        triggeredBy: triggeredBy
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

      return {
        success: true,
        message: `Items synced successfully (${limit === Infinity ? 'all' : limit} items requested)`,
        data: results,
        fetchId: fetchRecord._id
      };
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

      throw error;
    } finally {
      if (syncService) {
        console.log('Closing sync service...');
        await syncService.close();
        console.log('Sync service closed\n');
      }
    }
  }

  /**
   * Sync pending invoices from RouteStar
   * @param {number} limit - Number of invoices to sync (0 or Infinity for all)
   * @param {string} direction - Direction to sync ('new' or 'old')
   * @param {string} triggeredBy - Who/what triggered the sync (default: 'manual')
   * @returns {Promise<Object>} - Sync results and fetchId
   */
  async syncPending(limit, direction = 'new', triggeredBy = 'manual') {
    let syncService = null;
    let fetchRecord = null;

    try {
      // Create fetch history record
      fetchRecord = await FetchHistory.startFetch('routestar_invoices', 'pending', {
        limit: limit,
        direction: direction,
        triggeredBy: triggeredBy
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
        updated: results.updated || 0,
        deleted: results.deleted || 0
      });

      const limitText = limit === Infinity ? 'all available' : limit;

      console.log(`\n========================================`);
      console.log(`Pending invoices sync completed successfully`);
      console.log(`========================================\n`);

      return {
        success: true,
        message: `Pending invoices synced successfully (${limitText} ${direction} invoices requested)`,
        data: results,
        fetchId: fetchRecord._id
      };
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

      throw error;
    } finally {
      if (syncService) {
        console.log('Closing sync service...');
        await syncService.close();
        console.log('Sync service closed\n');
      }
    }
  }

  /**
   * Get invoice range (highest and lowest invoice numbers)
   * @param {string} invoiceType - Optional invoice type filter
   * @returns {Promise<Object>} - Invoice range data
   */
  async getInvoiceRange(invoiceType) {
    try {
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

      return {
        success: true,
        data: {
          highest: highestInvoice?.invoiceNumber || null,
          lowest: lowestInvoice?.invoiceNumber || null,
          highestDate: highestInvoice?.invoiceDate || null,
          lowestDate: lowestInvoice?.invoiceDate || null,
          totalInvoices,
          invoiceType: invoiceType || 'all'
        }
      };
    } catch (error) {
      console.error('Get invoice range error:', error);
      throw error;
    }
  }

  /**
   * Sync closed invoices from RouteStar
   * @param {number} limit - Number of invoices to sync (0 or Infinity for all)
   * @param {string} direction - Direction to sync ('new' or 'old')
   * @param {string} triggeredBy - Who/what triggered the sync (default: 'manual')
   * @returns {Promise<Object>} - Sync results and fetchId
   */
  async syncClosed(limit, direction = 'new', triggeredBy = 'manual') {
    let syncService = null;
    let fetchRecord = null;

    try {
      // Create fetch history record
      fetchRecord = await FetchHistory.startFetch('routestar_invoices', 'closed', {
        limit: limit,
        direction: direction,
        triggeredBy: triggeredBy
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

      return {
        success: true,
        message: `Closed invoices synced successfully (${limitText} ${direction} invoices requested)`,
        data: results,
        fetchId: fetchRecord._id
      };
    } catch (error) {
      console.error('Closed invoices sync error:', error);

      // Mark fetch as failed
      if (fetchRecord) {
        await fetchRecord.markFailed(error.message, { stack: error.stack });
      }

      throw error;
    } finally {
      if (syncService) {
        await syncService.close();
      }
    }
  }

  /**
   * Sync details for a specific invoice
   * @param {string} invoiceNumber - Invoice number to sync details for
   * @returns {Promise<Object>} - Invoice data
   */
  async syncInvoiceDetails(invoiceNumber) {
    let syncService = null;

    try {
      syncService = new RouteStarSyncService();
      await syncService.init();

      const invoice = await syncService.syncInvoiceDetails(invoiceNumber);

      return {
        success: true,
        message: 'Invoice details synced successfully',
        data: invoice
      };
    } catch (error) {
      console.error('Invoice details sync error:', error);
      throw error;
    } finally {
      if (syncService) {
        await syncService.close();
      }
    }
  }

  /**
   * Sync details for all invoices
   * @param {number} limit - Number of invoices to sync details for (0 for all)
   * @returns {Promise<Object>} - Sync results
   */
  async syncAllDetails(limit = 0) {
    let syncService = null;

    try {
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

      return {
        success: true,
        message: 'Invoice details synced successfully',
        data: results
      };
    } catch (error) {
      console.error('\n========================================');
      console.error('❌ INVOICE DETAILS SYNC ERROR:');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('========================================\n');

      throw error;
    } finally {
      if (syncService) {
        console.log('Closing sync service...');
        await syncService.close();
        console.log('Sync service closed\n');
      }
    }
  }

  /**
   * Sync details for pending invoices only
   * @param {number} limit - Number of invoices to sync details for (0 for all)
   * @returns {Promise<Object>} - Sync results
   */
  async syncPendingDetails(limit = 0) {
    let syncService = null;

    try {
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

      return {
        success: true,
        message: 'Pending invoice details synced successfully',
        data: results
      };
    } catch (error) {
      console.error('\n========================================');
      console.error('❌ PENDING INVOICE DETAILS SYNC ERROR:');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('========================================\n');

      throw error;
    } finally {
      if (syncService) {
        console.log('Closing sync service...');
        await syncService.close();
        console.log('Sync service closed\n');
      }
    }
  }

  /**
   * Sync details for closed invoices only
   * @param {number} limit - Number of invoices to sync details for (0 for all)
   * @returns {Promise<Object>} - Sync results
   */
  async syncClosedDetails(limit = 0) {
    let syncService = null;

    try {
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

      return {
        success: true,
        message: 'Closed invoice details synced successfully',
        data: results
      };
    } catch (error) {
      console.error('\n========================================');
      console.error('❌ CLOSED INVOICE DETAILS SYNC ERROR:');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('========================================\n');

      throw error;
    } finally {
      if (syncService) {
        console.log('Closing sync service...');
        await syncService.close();
        console.log('Sync service closed\n');
      }
    }
  }

  /**
   * Sync pending invoices with their details
   * @param {number} invoicesLimit - Number of invoices to sync (0 for all)
   * @param {number} detailsLimit - Number of details to sync (0 for all)
   * @param {string} triggeredBy - Who/what triggered the sync (default: 'manual')
   * @returns {Promise<Object>} - Combined sync results and fetchId
   */
  async syncPendingWithDetails(invoicesLimit = 0, detailsLimit = 0, triggeredBy = 'manual') {
    let syncService = null;
    let fetchRecord = null;

    try {
      const direction = 'new';

      // Create fetch history record
      fetchRecord = await FetchHistory.startFetch('routestar_invoices', 'pending_with_details', {
        limit: invoicesLimit,
        direction: direction,
        triggeredBy: triggeredBy
      });

      console.log('\n========================================');
      console.log('Starting pending invoices + details sync');
      console.log(`Limit: ${invoicesLimit === 0 ? 'Infinity' : invoicesLimit}, Direction: ${direction}`);
      console.log(`Fetch ID: ${fetchRecord._id}`);
      console.log('========================================\n');

      console.log('Created sync service, initializing...');
      syncService = new RouteStarSyncService();
      await syncService.init();

      console.log('Sync service initialized, starting sync...');

      const invoiceResults = await syncService.syncPendingInvoices(invoicesLimit, direction);
      console.log(`\nStep 1 complete: ${invoiceResults.created} created, ${invoiceResults.updated} updated, ${invoiceResults.detailsFetched || 0} details fetched inline`);

      // Sync details only for invoices that don't have line items yet (catch any that weren't fetched inline)
      const detailsResults = await syncService.syncAllInvoiceDetails(0, 'Pending');
      console.log(`\nStep 2 complete: ${detailsResults.synced} additional details synced`);

      // Mark fetch as completed - combine inline and batch detail counts
      const totalDetailsSynced = (invoiceResults.detailsFetched || 0) + (detailsResults.synced || 0);
      await fetchRecord.markCompleted({
        totalFetched: invoiceResults.total || 0,
        created: invoiceResults.created || 0,
        updated: invoiceResults.updated || 0,
        detailsSynced: totalDetailsSynced
      });

      console.log('\n========================================');
      console.log('Pending invoices + details sync completed successfully');
      console.log('========================================\n');

      return {
        success: true,
        message: 'Pending invoices and details synced successfully',
        data: {
          invoices: invoiceResults,
          details: detailsResults
        },
        fetchId: fetchRecord._id
      };
    } catch (error) {
      console.error('\n========================================');
      console.error('❌ PENDING + DETAILS SYNC ERROR:');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('========================================\n');

      // Mark fetch as failed
      if (fetchRecord) {
        await fetchRecord.markFailed(error.message, { stack: error.stack });
      }

      throw error;
    } finally {
      if (syncService) {
        console.log('Closing sync service...');
        await syncService.close();
        console.log('Sync service closed\n');
      }
    }
  }

  /**
   * Sync closed invoices with their details
   * @param {number} invoicesLimit - Number of invoices to sync (0 for all)
   * @param {number} detailsLimit - Number of details to sync (0 for all)
   * @param {string} triggeredBy - Who/what triggered the sync (default: 'manual')
   * @returns {Promise<Object>} - Combined sync results and fetchId
   */
  async syncClosedWithDetails(invoicesLimit = 0, detailsLimit = 0, triggeredBy = 'manual') {
    let syncService = null;
    let fetchRecord = null;

    try {
      const direction = 'new';

      // Create fetch history record
      fetchRecord = await FetchHistory.startFetch('routestar_invoices', 'closed_with_details', {
        limit: invoicesLimit,
        direction: direction,
        triggeredBy: triggeredBy
      });

      console.log('\n========================================');
      console.log('Starting closed invoices + details sync');
      console.log(`Limit: ${invoicesLimit === 0 ? 'Infinity' : invoicesLimit}, Direction: ${direction}`);
      console.log(`Fetch ID: ${fetchRecord._id}`);
      console.log('========================================\n');

      console.log('Created sync service, initializing...');
      syncService = new RouteStarSyncService();
      await syncService.init();

      console.log('Sync service initialized, starting sync...');

      const invoiceResults = await syncService.syncClosedInvoices(invoicesLimit, direction);
      console.log(`\nStep 1 complete: ${invoiceResults.created} created, ${invoiceResults.updated} updated, ${invoiceResults.detailsFetched || 0} details fetched inline`);

      // Sync details only for invoices that don't have line items yet (catch any that weren't fetched inline)
      const detailsResults = await syncService.syncAllInvoiceDetails(0, 'Closed', false);
      console.log(`\nStep 2 complete: ${detailsResults.synced} additional details synced`);

      // Mark fetch as completed - combine inline and batch detail counts
      const totalDetailsSynced = (invoiceResults.detailsFetched || 0) + (detailsResults.synced || 0);
      await fetchRecord.markCompleted({
        totalFetched: invoiceResults.total || 0,
        created: invoiceResults.created || 0,
        updated: invoiceResults.updated || 0,
        detailsSynced: totalDetailsSynced
      });

      console.log('\n========================================');
      console.log('Closed invoices + details sync completed successfully');
      console.log('========================================\n');

      return {
        success: true,
        message: 'Closed invoices and details synced successfully',
        data: {
          invoices: invoiceResults,
          details: detailsResults
        },
        fetchId: fetchRecord._id
      };
    } catch (error) {
      console.error('\n========================================');
      console.error('❌ CLOSED + DETAILS SYNC ERROR:');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('========================================\n');

      // Mark fetch as failed
      if (fetchRecord) {
        await fetchRecord.markFailed(error.message, { stack: error.stack });
      }

      throw error;
    } finally {
      if (syncService) {
        console.log('Closing sync service...');
        await syncService.close();
        console.log('Sync service closed\n');
      }
    }
  }

  /**
   * Check pending invoices in RouteStar
   * @returns {Promise<Object>} - Check results
   */
  async checkPending() {
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

      return {
        success: true,
        message: 'Pending invoices check completed',
        data: result
      };
    } catch (error) {
      console.error('\n========================================');
      console.error('❌ CHECK PENDING INVOICES ERROR:');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('========================================\n');

      throw error;
    } finally {
      if (syncService) {
        console.log('Closing sync service...');
        await syncService.close();
        console.log('Sync service closed\n');
      }
    }
  }

  /**
   * Sync stock movements
   * @returns {Promise<Object>} - Stock sync results
   */
  async syncStock() {
    let syncService = null;

    try {
      syncService = new RouteStarSyncService();
      await syncService.init();

      const results = await syncService.processStockMovements();

      return {
        success: true,
        message: 'Stock movements processed successfully',
        data: results
      };
    } catch (error) {
      console.error('Stock movements error:', error);
      throw error;
    } finally {
      if (syncService) {
        await syncService.close();
      }
    }
  }

  /**
   * Perform a full sync (pending, closed, and stock)
   * @param {Object} options - Sync options
   * @param {number} options.pendingLimit - Number of pending invoices to sync
   * @param {number} options.closedLimit - Number of closed invoices to sync
   * @param {boolean} options.processStock - Whether to process stock movements
   * @returns {Promise<Object>} - Full sync results
   */
  async fullSync(options = {}) {
    let syncService = null;

    try {
      const {
        pendingLimit = 100,
        closedLimit = 100,
        processStock = true
      } = options;

      syncService = new RouteStarSyncService();
      await syncService.init();

      const results = await syncService.fullSync({
        pendingLimit,
        closedLimit,
        processStock
      });

      return {
        success: true,
        message: 'Full sync completed successfully',
        data: results
      };
    } catch (error) {
      console.error('Full sync error:', error);
      throw error;
    } finally {
      if (syncService) {
        await syncService.close();
      }
    }
  }

  /**
   * Get invoices with filters and pagination
   * @param {Object} filters - Query filters
   * @param {Object} options - Pagination and other options
   * @returns {Promise<Object>} - Invoices and pagination info
   */
  async getInvoices(filters = {}, options = {}) {
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
      } = { ...filters, ...options };

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

      return {
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
      };
    } catch (error) {
      console.error('Get invoices error:', error);
      throw error;
    }
  }

  /**
   * Get invoice by invoice number
   * @param {string} invoiceNumber - Invoice number to retrieve
   * @returns {Promise<Object>} - Invoice data
   */
  async getInvoiceByNumber(invoiceNumber) {
    try {
      const invoice = await RouteStarInvoice.findByInvoiceNumber(invoiceNumber);

      if (!invoice) {
        return {
          success: false,
          message: 'Invoice not found',
          notFound: true
        };
      }

      return {
        success: true,
        data: invoice
      };
    } catch (error) {
      console.error('Get invoice error:', error);
      throw error;
    }
  }

  /**
   * Get sales statistics
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} - Statistics data
   */
  async getStats(options = {}) {
    try {
      const { startDate, endDate, customer, assignedTo } = options;

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

      return {
        success: true,
        data: {
          dateRange: { start, end },
          sales: stats,
          topCustomers,
          statusBreakdown: statusCounts
        }
      };
    } catch (error) {
      console.error('Get stats error:', error);
      throw error;
    }
  }

  /**
   * Delete all pending invoices
   * @returns {Promise<Object>} - Delete results
   */
  async deleteAllPending() {
    try {
      const result = await RouteStarInvoice.deleteMany({ invoiceType: 'pending' });

      return {
        success: true,
        message: `Deleted ${result.deletedCount} pending invoices`,
        data: {
          deletedCount: result.deletedCount
        }
      };
    } catch (error) {
      console.error('Delete all pending invoices error:', error);
      throw error;
    }
  }

  /**
   * Delete all closed invoices
   * @returns {Promise<Object>} - Delete results
   */
  async deleteAllClosed() {
    try {
      const result = await RouteStarInvoice.deleteMany({ invoiceType: 'closed' });

      return {
        success: true,
        message: `Deleted ${result.deletedCount} closed invoices`,
        data: {
          deletedCount: result.deletedCount
        }
      };
    } catch (error) {
      console.error('Delete all closed invoices error:', error);
      throw error;
    }
  }

  /**
   * Get grouped items from invoices
   * @param {Object} options - Query and pagination options
   * @returns {Promise<Object>} - Grouped items and pagination
   */
  async getGroupedItems(options = {}) {
    try {
      const {
        page = 1,
        limit = 100,
        sortBy = 'name',
        sortOrder = 'asc',
        search = '',
        minQuantity = 0
      } = options;

      // Pre-compute all parameters
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;
      const sortDirection = sortOrder === 'desc' ? -1 : 1;
      const sortField = sortBy === 'quantity' ? 'totalQuantity' : sortBy === 'value' ? 'totalValue' : 'name';
      const minQty = parseInt(minQuantity);

      console.log('[getGroupedRouteStarItems] Starting ultra-optimized aggregation...');
      console.time('[getGroupedRouteStarItems] Total time');

      // Ultra-optimized: Group first, then lookup aliases only on unique names
      const result = await RouteStarInvoice.aggregate([
        // Stage 1: Filter early
        {
          $match: {
            'lineItems.0': { $exists: true }
          }
        },

        // Stage 2: Project only needed fields
        {
          $project: {
            lineItems: 1
          }
        },

        // Stage 3: Unwind
        { $unwind: '$lineItems' },

        // Stage 4: Filter invalid items and search
        {
          $match: {
            'lineItems.name': { $exists: true, $ne: null, $ne: '' },
            ...(search ? {
              $or: [
                { 'lineItems.name': { $regex: search, $options: 'i' } },
                { 'lineItems.sku': { $regex: search, $options: 'i' } }
              ]
            } : {})
          }
        },

        // Stage 5: Group by ORIGINAL name first (before alias lookup)
        {
          $group: {
            _id: '$lineItems.name',
            totalQuantity: { $sum: '$lineItems.quantity' },
            totalValue: { $sum: '$lineItems.amount' },
            sumRates: { $sum: '$lineItems.rate' },
            countRates: { $sum: 1 },
            sku: { $first: { $ifNull: ['$lineItems.sku', '$lineItems.name'] } }
          }
        },

        // Stage 6: Add lowercase for lookup (only once per unique item now!)
        {
          $addFields: {
            nameLower: { $toLower: '$_id' }
          }
        },

        // Stage 7: Lookup aliases (much faster - only on unique items, not every line item!)
        {
          $lookup: {
            from: 'routestaritemaliases',
            let: { itemNameLower: '$nameLower' },
            pipeline: [
              {
                $match: {
                  isActive: true,
                  $expr: {
                    $in: ['$$itemNameLower', {
                      $map: {
                        input: '$aliases',
                        as: 'alias',
                        in: { $toLower: '$$alias.name' }
                      }
                    }]
                  }
                }
              },
              { $limit: 1 },
              { $project: { canonicalName: 1, _id: 0 } }
            ],
            as: 'aliasDoc'
          }
        },

        // Stage 8: Determine canonical name
        {
          $addFields: {
            canonicalName: {
              $cond: {
                if: { $gt: [{ $size: '$aliasDoc' }, 0] },
                then: { $arrayElemAt: ['$aliasDoc.canonicalName', 0] },
                else: '$_id'
              }
            }
          }
        },

        // Stage 9: Regroup by canonical name (merging aliases)
        {
          $group: {
            _id: '$canonicalName',
            totalQuantity: { $sum: '$totalQuantity' },
            totalValue: { $sum: '$totalValue' },
            sumRates: { $sum: '$sumRates' },
            countRates: { $sum: '$countRates' },
            sku: { $first: '$sku' }
          }
        },

        // Stage 10: Filter by minimum quantity
        ...(minQty > 0 ? [{
          $match: {
            totalQuantity: { $gte: minQty }
          }
        }] : []),

        // Stage 11: Format output with calculated average
        {
          $project: {
            _id: 0,
            name: '$_id',
            sku: 1,
            totalQuantity: 1,
            totalValue: { $round: ['$totalValue', 2] },
            avgUnitPrice: {
              $round: [
                { $cond: [{ $eq: ['$countRates', 0] }, 0, { $divide: ['$sumRates', '$countRates'] }] },
                2
              ]
            },
            invoiceCount: '$countRates'
          }
        },

        // Stage 12: Sort
        { $sort: { [sortField]: sortDirection } },

        // Stage 13: Paginate with $facet
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            data: [{ $skip: skip }, { $limit: limitNum }]
          }
        }
      ]);

      const total = result[0].metadata[0]?.total || 0;
      const items = result[0].data || [];

      console.timeEnd('[getGroupedRouteStarItems] Total time');
      console.log(`[getGroupedRouteStarItems] Returned ${items.length} items out of ${total} total`);

      return {
        success: true,
        data: {
          items,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      };
    } catch (error) {
      console.error('Get grouped RouteStar items error:', error);
      throw error;
    }
  }

  /**
   * Get all invoice entries for a specific item
   * @param {string} itemName - Item name to search for
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} - Invoice entries and pagination
   */
  async getInvoicesByItem(itemName, options = {}) {
    try {
      const { page = 1, limit = 100 } = options;

      // Pre-compute pagination parameters
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      console.log(`[getInvoicesByItem] Starting ultra-optimized query for item: ${itemName}`);
      console.time('[getInvoicesByItem] Total time');

      const itemNameLower = itemName.toLowerCase();

      // CRITICAL OPTIMIZATION: Do a quick alias lookup FIRST to get all variations
      // This prevents doing expensive lookups on every line item
      const aliasDoc = await RouteStarItemAlias.findOne({
        isActive: true,
        aliases: {
          $elemMatch: {
            name: { $regex: new RegExp(`^${itemName}$`, 'i') }
          }
        }
      }).select('canonicalName aliases').lean();

      // Build search array: if alias found, use all variations; otherwise just the item name
      let searchNames;
      let canonicalName;

      if (aliasDoc) {
        canonicalName = aliasDoc.canonicalName;
        searchNames = aliasDoc.aliases.map(a => a.name.toLowerCase());
      } else {
        canonicalName = itemName;
        searchNames = [itemNameLower];
      }

      console.log(`[getInvoicesByItem] Searching for ${searchNames.length} variations`);

      // Ultra-optimized aggregation: Filter FIRST, then process
      const result = await RouteStarInvoice.aggregate([
        // Stage 1: Early filter - only invoices with matching items (CRITICAL!)
        {
          $match: {
            'lineItems.0': { $exists: true },
            'lineItems.name': {
              $in: searchNames.map(name => new RegExp(`^${name}$`, 'i'))
            }
          }
        },

        // Stage 2: Project only needed fields early
        {
          $project: {
            invoiceNumber: 1,
            invoiceDate: 1,
            invoiceType: 1,
            customerName: { $ifNull: ['$customer.name', 'N/A'] },
            status: 1,
            stockProcessed: 1,
            lineItems: 1
          }
        },

        // Stage 3: Unwind line items
        { $unwind: '$lineItems' },

        // Stage 4: Filter to only matching line items
        {
          $match: {
            $expr: {
              $in: [
                { $toLower: '$lineItems.name' },
                searchNames
              ]
            }
          }
        },

        // Stage 5: Project final structure
        {
          $project: {
            _id: 1,
            invoiceNumber: 1,
            invoiceDate: 1,
            invoiceType: 1,
            customerName: 1,
            status: 1,
            stockProcessed: 1,
            itemName: '$lineItems.name',
            quantity: '$lineItems.quantity',
            rate: '$lineItems.rate',
            amount: '$lineItems.amount',
            sku: { $ifNull: ['$lineItems.sku', '$lineItems.name'] }
          }
        },

        // Stage 6: Sort by invoice date (newest first)
        { $sort: { invoiceDate: -1 } },

        // Stage 7: Paginate with $facet (single query for data + count)
        {
          $facet: {
            metadata: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  totalQuantity: { $sum: '$quantity' }
                }
              }
            ],
            data: [
              { $skip: skip },
              { $limit: limitNum },
              {
                $project: {
                  _id: 0,
                  invoiceId: '$_id',
                  invoiceNumber: 1,
                  invoiceDate: 1,
                  invoiceType: 1,
                  customerName: 1,
                  status: 1,
                  stockProcessed: 1,
                  itemName: 1,
                  quantity: 1,
                  rate: 1,
                  amount: 1,
                  sku: 1
                }
              }
            ]
          }
        }
      ]);

      const metadata = result[0].metadata[0] || { total: 0, totalQuantity: 0 };
      const entries = result[0].data || [];

      console.timeEnd('[getInvoicesByItem] Total time');
      console.log(`[getInvoicesByItem] Returned ${entries.length} entries out of ${metadata.total} total`);

      return {
        success: true,
        data: {
          itemName: canonicalName,
          entries,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: metadata.total,
            pages: Math.ceil(metadata.total / limitNum)
          },
          totalQuantity: metadata.totalQuantity
        }
      };
    } catch (error) {
      console.error('Get invoices by item error:', error);
      throw error;
    }
  }

  /**
   * Bulk delete invoices by SKUs
   * @param {Array<string>} items - Array of SKUs to delete
   * @returns {Promise<Object>} - Delete results
   */
  async bulkDeleteInvoices(items) {
    try {
      if (!items || !Array.isArray(items) || items.length === 0) {
        return {
          success: false,
          message: 'Please provide an array of SKUs to delete',
          validationError: true
        };
      }

      console.log(`[Bulk Delete Invoices] Deleting invoices with SKUs: ${items.join(', ')}`);

      const result = await RouteStarInvoice.deleteMany({
        'lineItems.sku': { $in: items }
      });

      console.log(`[Bulk Delete Invoices] Deleted ${result.deletedCount} invoices`);

      return {
        success: true,
        message: `Successfully deleted ${result.deletedCount} invoices containing the specified SKUs`,
        data: {
          deletedCount: result.deletedCount,
          skus: items
        }
      };
    } catch (error) {
      console.error('Bulk delete invoices error:', error);
      throw error;
    }
  }

  /**
   * Bulk delete invoices by invoice numbers
   * @param {Array<string>} invoiceNumbers - Array of invoice numbers to delete
   * @returns {Promise<Object>} - Delete results
   */
  async bulkDeleteByNumbers(invoiceNumbers) {
    try {
      if (!invoiceNumbers || !Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
        return {
          success: false,
          message: 'Please provide an array of invoice numbers to delete',
          validationError: true
        };
      }

      console.log(`[Bulk Delete Invoices] Deleting invoices with numbers: ${invoiceNumbers.join(', ')}`);

      const result = await RouteStarInvoice.deleteMany({
        invoiceNumber: { $in: invoiceNumbers }
      });

      console.log(`[Bulk Delete Invoices] Deleted ${result.deletedCount} invoices`);

      return {
        success: true,
        message: `Successfully deleted ${result.deletedCount} invoices`,
        data: {
          deletedCount: result.deletedCount,
          invoiceNumbers: invoiceNumbers
        }
      };
    } catch (error) {
      console.error('Bulk delete invoices error:', error);
      throw error;
    }
  }

  /**
   * Get items with filters and pagination
   * @param {Object} options - Query and pagination options
   * @returns {Promise<Object>} - Items and pagination
   */
  async getItems(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        category,
        department,
        type,
        inStock,
        searchTerm
      } = options;

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

      return {
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
      };
    } catch (error) {
      console.error('Get items error:', error);
      throw error;
    }
  }

  /**
   * Get low stock items
   * @param {number} threshold - Stock threshold (default: 10)
   * @returns {Promise<Object>} - Low stock items
   */
  async getLowStockItems(threshold = 10) {
    try {
      const items = await RouteStarItem.getLowStock(parseInt(threshold));

      return {
        success: true,
        data: {
          items,
          totalItems: items.length,
          threshold: parseInt(threshold)
        }
      };
    } catch (error) {
      console.error('Get low stock items error:', error);
      throw error;
    }
  }

  /**
   * Delete all items
   * @returns {Promise<Object>} - Delete results
   */
  async deleteAllItems() {
    try {
      const result = await RouteStarItem.deleteMany({});

      return {
        success: true,
        message: `Deleted ${result.deletedCount} items`,
        data: {
          deletedCount: result.deletedCount
        }
      };
    } catch (error) {
      console.error('Delete all items error:', error);
      throw error;
    }
  }

  /**
   * Get all item names with their invoice usage in a folder structure
   * @returns {Promise<Object>} - Items with invoice usage
   */
  async getItemInvoiceUsage() {
    try {
      // Get alias map and reverse map (alias -> canonical)
      const aliasMap = await RouteStarItemAlias.buildLookupMap();

      // Build reverse map with ORIGINAL case aliases from database
      // We need original case for MongoDB queries
      const aliasDocs = await RouteStarItemAlias.find({ isActive: true }).lean();
      const canonicalToOriginalAliases = {};
      aliasDocs.forEach(doc => {
        if (!canonicalToOriginalAliases[doc.canonicalName]) {
          canonicalToOriginalAliases[doc.canonicalName] = [];
        }
        doc.aliases.forEach(alias => {
          if (alias.name !== doc.canonicalName) {
            canonicalToOriginalAliases[doc.canonicalName].push(alias.name);
          }
        });
      });

      // Get all unique canonical names
      const canonicalNames = [...new Set(Object.values(aliasMap))];

      // Get all unique item names from invoices
      const allInvoiceItems = await RouteStarInvoice.distinct('lineItems.name');

      // Separate into mapped (canonical) and unmapped (unique) names
      const mappedNames = new Set();
      const unmappedNames = new Set();

      allInvoiceItems.forEach(itemName => {
        const nameLower = itemName.toLowerCase();
        const canonical = aliasMap[nameLower];

        if (canonical) {
          // This item is mapped to a canonical name
          mappedNames.add(canonical);
        } else {
          // This item is not mapped
          unmappedNames.add(itemName);
        }
      });

      // Build result array with invoice usage for each item
      const itemsWithInvoices = [];

      // Process mapped (canonical) names
      for (const canonicalName of mappedNames) {
        // Get all variations (aliases) with ORIGINAL case for this canonical name
        const variations = [canonicalName, ...(canonicalToOriginalAliases[canonicalName] || [])];

        // Find all invoices that use any of these variations (case-insensitive)
        const invoices = await RouteStarInvoice.find({
          'lineItems.name': { $in: variations }
        }).select('invoiceNumber invoiceDate customer status lineItems total').lean();

        // Extract relevant invoice details
        const invoiceDetails = invoices.map(invoice => {
          // Find the matching line items
          const matchingItems = invoice.lineItems.filter(item =>
            variations.map(v => v.toLowerCase()).includes(item.name.toLowerCase())
          );

          return {
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            customer: invoice.customer?.name || 'Unknown',
            status: invoice.status,
            total: invoice.total,
            items: matchingItems.map(item => ({
              name: item.name,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount
            })),
            totalQuantity: matchingItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
          };
        });

        itemsWithInvoices.push({
          itemName: canonicalName,
          type: 'mapped',
          aliases: canonicalToOriginalAliases[canonicalName] || [],
          invoiceCount: invoices.length,
          totalQuantitySold: invoiceDetails.reduce((sum, inv) => sum + inv.totalQuantity, 0),
          invoices: invoiceDetails
        });
      }

      // Process unmapped (unique) names
      for (const uniqueName of unmappedNames) {
        // Find all invoices that use this exact name
        const invoices = await RouteStarInvoice.find({
          'lineItems.name': uniqueName
        }).select('invoiceNumber invoiceDate customer status lineItems total').lean();

        // Extract relevant invoice details
        const invoiceDetails = invoices.map(invoice => {
          // Find the matching line items
          const matchingItems = invoice.lineItems.filter(item =>
            item.name.toLowerCase() === uniqueName.toLowerCase()
          );

          return {
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            customer: invoice.customer?.name || 'Unknown',
            status: invoice.status,
            total: invoice.total,
            items: matchingItems.map(item => ({
              name: item.name,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount
            })),
            totalQuantity: matchingItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
          };
        });

        itemsWithInvoices.push({
          itemName: uniqueName,
          type: 'unique',
          aliases: [],
          invoiceCount: invoices.length,
          totalQuantitySold: invoiceDetails.reduce((sum, inv) => sum + inv.totalQuantity, 0),
          invoices: invoiceDetails
        });
      }

      // Sort by item name
      itemsWithInvoices.sort((a, b) => a.itemName.localeCompare(b.itemName));

      // Calculate totals
      const totals = {
        totalMappedItems: Array.from(mappedNames).length,
        totalUniqueItems: Array.from(unmappedNames).length,
        totalItems: mappedNames.size + unmappedNames.size,
        totalInvoices: itemsWithInvoices.reduce((sum, item) => sum + item.invoiceCount, 0)
      };

      return {
        success: true,
        data: {
          items: itemsWithInvoices,
          totals
        }
      };
    } catch (error) {
      console.error('Get items invoice usage error:', error);
      throw error;
    }
  }
}

module.exports = new RouteStarService();
