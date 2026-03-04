const CustomerConnectSyncService = require('../services/customerConnectSync.service');
const customerConnectService = require('../services/customerConnect.service');

/**
 * CustomerConnect Controller
 * Handles HTTP requests for CustomerConnect operations
 */
class CustomerConnectController {
  /**
   * Sync orders from CustomerConnect
   * POST /api/customerconnect/sync/orders
   */
  async syncOrders(req, res, next) {
    try {
      const options = {
        limit: req.body.limit,
        direction: req.body.direction || 'new',
        triggeredBy: req.body.triggeredBy || 'manual'
      };

      const result = await customerConnectService.syncOrders(options);

      res.json({
        success: true,
        message: result.message,
        data: result.data,
        fetchId: result.fetchId
      });
    } catch (error) {
      console.error('Orders sync error:', error);
      next(error);
    }
  }

  /**
   * Get order range (highest/lowest) - DEPRECATED
   * GET /api/customerconnect/order-range
   */
  async getOrderRange(req, res, next) {
    try {
      const range = await customerConnectService.getOrderRange();

      res.json({
        success: true,
        data: range
      });
    } catch (error) {
      console.error('Get order range error:', error);
      next(error);
    }
  }

  /**
   * Sync single order details
   * POST /api/customerconnect/sync/details/:orderNumber
   */
  async syncOrderDetails(req, res, next) {
    try {
      const { orderNumber } = req.params;

      const order = await customerConnectService.syncOrderDetails(orderNumber);

      res.json({
        success: true,
        message: 'Order details synced successfully',
        data: order
      });
    } catch (error) {
      console.error('Order details sync error:', error);
      next(error);
    }
  }

  /**
   * Sync all order details
   * POST /api/customerconnect/sync/all-details
   */
  async syncAllOrderDetails(req, res, next) {
    try {
      const { limit = 50 } = req.body;

      const results = await customerConnectService.syncAllOrderDetails(limit);

      res.json({
        success: true,
        message: 'All order details synced successfully',
        data: results
      });
    } catch (error) {
      console.error('All order details sync error:', error);
      next(error);
    }
  }

  /**
   * Process stock movements
   * POST /api/customerconnect/sync/stock
   */
  async syncStock(req, res, next) {
    try {
      const results = await customerConnectService.syncStock();

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
   * Full sync (orders + details + stock)
   * POST /api/customerconnect/sync/full
   */
  async fullSync(req, res, next) {
    try {
      const options = {
        ordersLimit: req.body.ordersLimit || 100,
        detailsLimit: req.body.detailsLimit || 50,
        processStock: req.body.processStock !== false
      };

      const results = await customerConnectService.fullSync(options);

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
   * Get orders with pagination and filtering
   * GET /api/customerconnect/orders
   */
  async getOrders(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        vendor: req.query.vendor,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        stockProcessed: req.query.stockProcessed,
        verified: req.query.verified
      };

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50,
        includeRange: req.query.includeRange !== 'false' // Default to true, only false if explicitly set
      };

      const result = await customerConnectService.getOrders(filters, options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get orders error:', error);
      next(error);
    }
  }

  /**
   * Get single order by order number
   * GET /api/customerconnect/orders/:orderNumber
   */
  async getOrderByNumber(req, res, next) {
    try {
      const { orderNumber } = req.params;

      const order = await customerConnectService.getOrderByNumber(orderNumber);

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
      next(error);
    }
  }

  /**
   * Get purchase statistics
   * GET /api/customerconnect/stats
   */
  async getStats(req, res, next) {
    try {
      const { startDate, endDate, vendor } = req.query;

      const stats = await customerConnectService.getStats({ startDate, endDate, vendor });

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
   * Get grouped items
   * GET /api/customerconnect/items/grouped
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

      const result = await customerConnectService.getGroupedItems(options);

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
   * Bulk delete orders by SKUs
   * POST /api/customerconnect/orders/bulk-delete
   */
  async bulkDeleteBySKUs(req, res, next) {
    try {
      const { skus } = req.body;

      if (!skus || !Array.isArray(skus) || skus.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of SKUs to delete'
        });
      }

      const result = await customerConnectService.bulkDeleteBySKUs(skus);

      res.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} orders containing the specified SKUs`,
        data: result
      });
    } catch (error) {
      console.error('Bulk delete error:', error);
      next(error);
    }
  }

  /**
   * Bulk delete orders by order numbers
   * POST /api/customerconnect/orders/bulk-delete-by-numbers
   */
  async bulkDeleteByOrderNumbers(req, res, next) {
    try {
      const { orderNumbers } = req.body;

      if (!orderNumbers || !Array.isArray(orderNumbers) || orderNumbers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of order numbers to delete'
        });
      }

      const result = await customerConnectService.bulkDeleteByOrderNumbers(orderNumbers);

      res.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} orders`,
        data: result
      });
    } catch (error) {
      console.error('Bulk delete orders error:', error);
      next(error);
    }
  }

  /**
   * Get orders for specific SKU
   * GET /api/customerconnect/items/:sku/orders
   */
  async getOrdersBySKU(req, res, next) {
    try {
      const { sku } = req.params;

      const result = await customerConnectService.getOrdersBySKU(sku);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get orders by SKU error:', error);
      next(error);
    }
  }

  /**
   * Delete all orders
   * DELETE /api/customerconnect/orders/all
   */
  async deleteAllOrders(req, res, next) {
    try {
      const result = await customerConnectService.deleteAllOrders();

      res.json({
        success: true,
        message: result.message,
        data: { deletedCount: result.deletedCount }
      });
    } catch (error) {
      console.error('Delete all orders error:', error);
      next(error);
    }
  }
}

module.exports = new CustomerConnectController();
