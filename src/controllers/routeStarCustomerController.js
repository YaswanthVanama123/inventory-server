const routeStarCustomerService = require('../services/routeStarCustomer.service');
const RouteStarSyncService = require('../services/routeStarSync.service');

let isSyncing = false;

class RouteStarCustomerController {
  async getCustomers(req, res, next) {
    try {
      const filters = {
        search: req.query.search,
        customerType: req.query.customerType,
        salesRep: req.query.salesRep,
        status: req.query.status,
        active: req.query.active
      };

      const pagination = {
        page: req.query.page || 1,
        limit: req.query.limit || 50,
        sortBy: req.query.sortBy || 'customerName',
        sortOrder: req.query.sortOrder || 'asc'
      };

      const data = await routeStarCustomerService.getCustomers(filters, pagination);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customers',
        error: error.message
      });
    }
  }

  async getCustomerById(req, res, next) {
    try {
      const customer = await routeStarCustomerService.getCustomerById(req.params.id);

      res.json({
        success: true,
        data: customer
      });
    } catch (error) {
      console.error('Error fetching customer:', error);
      if (error.message === 'Customer not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer',
        error: error.message
      });
    }
  }

  async getCustomerStats(req, res, next) {
    try {
      const stats = await routeStarCustomerService.getCustomerStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching customer stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer statistics',
        error: error.message
      });
    }
  }

  async syncCustomers(req, res, next) {
    if (isSyncing) {
      return res.status(409).json({
        success: false,
        message: 'Sync already in progress. Please wait for the current sync to complete.',
        error: 'SYNC_IN_PROGRESS'
      });
    }

    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : Infinity;

      console.log('Starting customer sync...');
      isSyncing = true;

      // Send immediate response to client
      res.json({
        success: true,
        message: 'Customer sync started. This may take several minutes.'
      });

      // Run sync in completely detached background process
      setImmediate(async () => {
        const syncService = new RouteStarSyncService();

        try {
          await syncService.init();
          const result = await syncService.syncCustomers(limit);
          console.log('✅ Customer sync completed successfully:', result);
        } catch (syncError) {
          console.error('❌ Customer sync failed:', syncError);
        } finally {
          try {
            await syncService.close();
          } catch (closeError) {
            console.error('Error closing sync service:', closeError);
          }
          isSyncing = false;
        }
      });
    } catch (error) {
      console.error('Error starting customer sync:', error);
      isSyncing = false;

      // If we haven't sent a response yet, send error
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Failed to start customer sync',
          error: error.message
        });
      }
    }
  }

  async deleteAllCustomers(req, res, next) {
    try {
      const result = await routeStarCustomerService.deleteAllCustomers();

      res.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} customers`,
        data: result
      });
    } catch (error) {
      console.error('Error deleting customers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete customers',
        error: error.message
      });
    }
  }

  async syncCustomerDetails(req, res, next) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : Infinity;
      const forceAll = req.query.forceAll === 'true';

      console.log('Starting customer details sync...');

      // Send immediate response to client
      res.json({
        success: true,
        message: 'Customer details sync started. This may take several minutes depending on the number of customers.'
      });

      // Run sync in completely detached background process
      setImmediate(async () => {
        const syncService = new RouteStarSyncService();

        try {
          await syncService.init();
          const result = await syncService.syncAllCustomerDetails(limit, forceAll);
          console.log('✅ Customer details sync completed successfully:', result);
        } catch (syncError) {
          console.error('❌ Customer details sync failed:', syncError);
        } finally {
          try {
            await syncService.close();
          } catch (closeError) {
            console.error('Error closing sync service:', closeError);
          }
        }
      });
    } catch (error) {
      console.error('Error starting customer details sync:', error);

      // If we haven't sent a response yet, send error
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Failed to start customer details sync',
          error: error.message
        });
      }
    }
  }

  async getCustomersFromClosedInvoices(req, res, next) {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
      const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

      const customers = await routeStarCustomerService.getCustomersFromClosedInvoices(startDate, endDate);

      res.json({
        success: true,
        data: customers
      });
    } catch (error) {
      console.error('Error fetching customers from closed invoices:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customers from closed invoices',
        error: error.message
      });
    }
  }
}

module.exports = new RouteStarCustomerController();
