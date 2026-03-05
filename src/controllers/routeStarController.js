const routeStarService = require('../services/routeStar.service');


class RouteStarController {
  
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

  
  async syncPendingWithDetails(req, res, next) {
    try {
      const { invoicesLimit = 0, detailsLimit = 50, triggeredBy = 'manual' } = req.body;

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

  
  async syncClosedWithDetails(req, res, next) {
    try {
      const { invoicesLimit = 0, detailsLimit = 50, triggeredBy = 'manual' } = req.body;

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

  
  async fullSync(req, res, next) {
    try {
      const options = {
        itemsLimit: req.body.itemsLimit || 0,
        invoicesLimit: req.body.invoicesLimit || 0,
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

      
      res.json(result);
    } catch (error) {
      console.error('Get invoices error:', error);
      next(error);
    }
  }

  
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

  
  async getInvoicesByItem(req, res, next) {
    try {
      const { itemName } = req.params;

      const result = await routeStarService.getInvoicesByItem(itemName);

      // Service already returns { success, data }, don't double-wrap
      res.json(result);
    } catch (error) {
      console.error('Get invoices by item error:', error);
      next(error);
    }
  }

  
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

  
  async getItemInvoiceUsage(req, res, next) {
    try {
      const result = await routeStarService.getItemInvoiceUsage();

      
      res.json(result);
    } catch (error) {
      console.error('Get item invoice usage error:', error);
      next(error);
    }
  }
}

module.exports = new RouteStarController();
