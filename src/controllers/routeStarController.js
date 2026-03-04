const routeStarService = require('../services/routeStar.service');

/**
 * RouteStar Controller
 * Handles HTTP requests for RouteStar sync operations
 */
class RouteStarController {
  /**
   * Sync items from RouteStar
   * POST /api/routestar/sync/items
   */
  async syncItems(req, res, next) {
    try {
      const { limit = 0, triggeredBy = 'manual' } = req.body;

      const result = await routeStarService.syncItems(limit, triggeredBy);

      res.json({
        success: true,
        message: result.message,
        data: result.data,
        fetchId: result.fetchId
      });
    } catch (error) {
      console.error('Items sync error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync items',
        error: error.message,
        fetchId: error.fetchId
      });
    }
  }

  /**
   * Sync pending invoices
   * POST /api/routestar/sync/pending
   */
  async syncPending(req, res, next) {
    try {
      const { limit = 0, direction = 'new', triggeredBy = 'manual' } = req.body;

      const result = await routeStarService.syncPending(limit, direction, triggeredBy);

      res.json({
        success: true,
        message: result.message,
        data: result.data,
        fetchId: result.fetchId
      });
    } catch (error) {
      console.error('Pending invoices sync error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync pending invoices',
        error: error.message,
        fetchId: error.fetchId
      });
    }
  }

  /**
   * Get invoice range
   * GET /api/routestar/invoice-range
   */
  async getInvoiceRange(req, res, next) {
    try {
      const range = await routeStarService.getInvoiceRange();

      res.json({
        success: true,
        data: range
      });
    } catch (error) {
      console.error('Get invoice range error:', error);
      next(error);
    }
  }

  /**
   * Sync closed invoices
   * POST /api/routestar/sync/closed
   */
  async syncClosed(req, res, next) {
    try {
      const { limit = 0, direction = 'new', triggeredBy = 'manual' } = req.body;

      const result = await routeStarService.syncClosed(limit, direction, triggeredBy);

      res.json({
        success: true,
        message: result.message,
        data: result.data,
        fetchId: result.fetchId
      });
    } catch (error) {
      console.error('Closed invoices sync error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync closed invoices',
        error: error.message,
        fetchId: error.fetchId
      });
    }
  }

  /**
   * Sync single invoice details
   * POST /api/routestar/sync/details/:invoiceNumber
   */
  async syncInvoiceDetails(req, res, next) {
    try {
      const { invoiceNumber } = req.params;

      const invoice = await routeStarService.syncInvoiceDetails(invoiceNumber);

      res.json({
        success: true,
        message: 'Invoice details synced successfully',
        data: invoice
      });
    } catch (error) {
      console.error('Invoice details sync error:', error);
      next(error);
    }
  }

  /**
   * Sync all invoice details
   * POST /api/routestar/sync/all-details
   */
  async syncAllDetails(req, res, next) {
    try {
      const { limit = 50 } = req.body;

      const results = await routeStarService.syncAllDetails(limit);

      res.json({
        success: true,
        message: 'All invoice details synced successfully',
        data: results
      });
    } catch (error) {
      console.error('All invoice details sync error:', error);
      next(error);
    }
  }

  /**
   * Sync pending invoice details
   * POST /api/routestar/sync/pending-details
   */
  async syncPendingDetails(req, res, next) {
    try {
      const { limit = 50 } = req.body;

      const results = await routeStarService.syncPendingDetails(limit);

      res.json({
        success: true,
        message: 'Pending invoice details synced successfully',
        data: results
      });
    } catch (error) {
      console.error('Pending invoice details sync error:', error);
      next(error);
    }
  }

  /**
   * Sync closed invoice details
   * POST /api/routestar/sync/closed-details
   */
  async syncClosedDetails(req, res, next) {
    try {
      const { limit = 50 } = req.body;

      const results = await routeStarService.syncClosedDetails(limit);

      res.json({
        success: true,
        message: 'Closed invoice details synced successfully',
        data: results
      });
    } catch (error) {
      console.error('Closed invoice details sync error:', error);
      next(error);
    }
  }

  /**
   * Sync pending invoices with details
   * POST /api/routestar/sync/pending-with-details
   */
  async syncPendingWithDetails(req, res, next) {
    try {
      const { invoicesLimit = 100, detailsLimit = 50, triggeredBy = 'manual' } = req.body;

      const results = await routeStarService.syncPendingWithDetails(invoicesLimit, detailsLimit, triggeredBy);

      res.json({
        success: true,
        message: 'Pending invoices with details synced successfully',
        data: results
      });
    } catch (error) {
      console.error('Pending with details sync error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync pending invoices with details',
        error: error.message,
        fetchId: error.fetchId
      });
    }
  }

  /**
   * Sync closed invoices with details
   * POST /api/routestar/sync/closed-with-details
   */
  async syncClosedWithDetails(req, res, next) {
    try {
      const { invoicesLimit = 100, detailsLimit = 50, triggeredBy = 'manual' } = req.body;

      const results = await routeStarService.syncClosedWithDetails(invoicesLimit, detailsLimit, triggeredBy);

      res.json({
        success: true,
        message: 'Closed invoices with details synced successfully',
        data: results
      });
    } catch (error) {
      console.error('Closed with details sync error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync closed invoices with details',
        error: error.message,
        fetchId: error.fetchId
      });
    }
  }

  /**
   * Check pending invoices
   * GET /api/routestar/check-pending
   */
  async checkPending(req, res, next) {
    try {
      const result = await routeStarService.checkPending();

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Check pending error:', error);
      next(error);
    }
  }

  /**
   * Process stock movements
   * POST /api/routestar/sync/stock
   */
  async syncStock(req, res, next) {
    try {
      const results = await routeStarService.syncStock();

      res.json({
        success: true,
        message: 'Stock movements processed successfully',
        data: results
      });
    } catch (error) {
      console.error('Stock movements error:', error);
      next(error);
    }
  }

  /**
   * Full sync
   * POST /api/routestar/sync/full
   */
  async fullSync(req, res, next) {
    try {
      const options = {
        itemsLimit: req.body.itemsLimit || 100,
        invoicesLimit: req.body.invoicesLimit || 100,
        detailsLimit: req.body.detailsLimit || 50,
        processStock: req.body.processStock !== false
      };

      const results = await routeStarService.fullSync(options);

      res.json({
        success: true,
        message: 'Full sync completed successfully',
        data: results
      });
    } catch (error) {
      console.error('Full sync error:', error);
      next(error);
    }
  }

  /**
   * Get invoices with pagination
   * GET /api/routestar/invoices
   */
  async getInvoices(req, res, next) {
    try {
      const filters = {
        invoiceType: req.query.invoiceType,
        status: req.query.status,
        customer: req.query.customer,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        stockProcessed: req.query.stockProcessed
      };

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50
      };

      const result = await routeStarService.getInvoices(filters, options);

      // Service already returns { success, data }, don't wrap it again
      res.json(result);
    } catch (error) {
      console.error('Get invoices error:', error);
      next(error);
    }
  }

  /**
   * Get single invoice by number
   * GET /api/routestar/invoices/:invoiceNumber
   */
  async getInvoiceByNumber(req, res, next) {
    try {
      const { invoiceNumber } = req.params;

      const invoice = await routeStarService.getInvoiceByNumber(invoiceNumber);

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
      next(error);
    }
  }

  /**
   * Get statistics
   * GET /api/routestar/stats
   */
  async getStats(req, res, next) {
    try {
      const { startDate, endDate, status } = req.query;

      const stats = await routeStarService.getStats({ startDate, endDate, status });

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get stats error:', error);
      next(error);
    }
  }

  /**
   * Delete all pending invoices
   * DELETE /api/routestar/invoices/pending/all
   */
  async deleteAllPending(req, res, next) {
    try {
      const result = await routeStarService.deleteAllPending();

      res.json({
        success: true,
        message: result.message,
        data: { deletedCount: result.deletedCount }
      });
    } catch (error) {
      console.error('Delete all pending error:', error);
      next(error);
    }
  }

  /**
   * Delete all closed invoices
   * DELETE /api/routestar/invoices/closed/all
   */
  async deleteAllClosed(req, res, next) {
    try {
      const result = await routeStarService.deleteAllClosed();

      res.json({
        success: true,
        message: result.message,
        data: { deletedCount: result.deletedCount }
      });
    } catch (error) {
      console.error('Delete all closed error:', error);
      next(error);
    }
  }

  /**
   * Get grouped items
   * GET /api/routestar/items/grouped
   */
  async getGroupedItems(req, res, next) {
    try {
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 100,
        sortBy: req.query.sortBy || 'name',
        sortOrder: req.query.sortOrder || 'asc',
        search: req.query.search || '',
        minQuantity: parseInt(req.query.minQuantity) || 0
      };

      const result = await routeStarService.getGroupedItems(options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get grouped items error:', error);
      next(error);
    }
  }

  /**
   * Get invoices for specific item
   * GET /api/routestar/items/:itemName/invoices
   */
  async getInvoicesByItem(req, res, next) {
    try {
      const { itemName } = req.params;

      const result = await routeStarService.getInvoicesByItem(itemName);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get invoices by item error:', error);
      next(error);
    }
  }

  /**
   * Bulk delete invoices
   * POST /api/routestar/invoices/bulk-delete
   */
  async bulkDeleteInvoices(req, res, next) {
    try {
      const { items } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of items to delete'
        });
      }

      const result = await routeStarService.bulkDeleteInvoices(items);

      res.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} invoices`,
        data: result
      });
    } catch (error) {
      console.error('Bulk delete error:', error);
      next(error);
    }
  }

  /**
   * Bulk delete invoices by invoice numbers
   * POST /api/routestar/invoices/bulk-delete-by-numbers
   */
  async bulkDeleteByNumbers(req, res, next) {
    try {
      const { invoiceNumbers } = req.body;

      if (!invoiceNumbers || !Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of invoice numbers to delete'
        });
      }

      const result = await routeStarService.bulkDeleteByNumbers(invoiceNumbers);

      res.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} invoices`,
        data: result
      });
    } catch (error) {
      console.error('Bulk delete by numbers error:', error);
      next(error);
    }
  }

  /**
   * Get all items
   * GET /api/routestar/items
   */
  async getItems(req, res, next) {
    try {
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50,
        search: req.query.search || '',
        forSell: req.query.forSell,
        forUse: req.query.forUse
      };

      const result = await routeStarService.getItems(options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get items error:', error);
      next(error);
    }
  }

  /**
   * Get low stock items
   * GET /api/routestar/items/low-stock
   */
  async getLowStockItems(req, res, next) {
    try {
      const items = await routeStarService.getLowStockItems();

      res.json({
        success: true,
        data: items
      });
    } catch (error) {
      console.error('Get low stock items error:', error);
      next(error);
    }
  }

  /**
   * Delete all items
   * DELETE /api/routestar/items/all
   */
  async deleteAllItems(req, res, next) {
    try {
      const result = await routeStarService.deleteAllItems();

      res.json({
        success: true,
        message: result.message,
        data: { deletedCount: result.deletedCount }
      });
    } catch (error) {
      console.error('Delete all items error:', error);
      next(error);
    }
  }

  /**
   * Get item invoice usage stats
   * GET /api/routestar/items/invoice-usage
   */
  async getItemInvoiceUsage(req, res, next) {
    try {
      const result = await routeStarService.getItemInvoiceUsage();

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get item invoice usage error:', error);
      next(error);
    }
  }
}

module.exports = new RouteStarController();
