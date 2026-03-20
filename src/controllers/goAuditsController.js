const goAuditsService = require('../services/goAudits.service');
const routeStarCustomerService = require('../services/routeStarCustomer.service');
const GoAuditsLocation = require('../models/GoAuditsLocation');

class GoAuditsController {
  /**
   * Get all GoAudits locations
   */
  async getLocations(req, res, next) {
    try {
      // Prevent caching
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const locations = await goAuditsService.getLocations();

      console.log('Controller received locations:', locations.length);

      res.json({
        success: true,
        data: locations,
        count: locations.length
      });
    } catch (error) {
      console.error('Error fetching GoAudits locations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch GoAudits locations',
        error: error.message
      });
    }
  }

  /**
   * Get sync status for all locations
   */
  async getSyncStatus(req, res, next) {
    try {
      const syncedLocations = await GoAuditsLocation.find()
        .sort({ lastSyncedAt: -1 })
        .lean();

      const stats = {
        total: syncedLocations.length,
        synced: syncedLocations.filter(l => l.syncStatus === 'synced').length,
        pending: syncedLocations.filter(l => l.syncStatus === 'pending').length,
        errors: syncedLocations.filter(l => l.syncStatus === 'error').length,
        created: syncedLocations.filter(l => l.createdInGoAudits).length
      };

      res.json({
        success: true,
        data: {
          stats,
          locations: syncedLocations
        }
      });
    } catch (error) {
      console.error('Error fetching sync status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sync status',
        error: error.message
      });
    }
  }

  /**
   * Sync customers from closed invoices to GoAudits
   */
  async syncClosedInvoiceCustomers(req, res, next) {
    try {
      const { startDate, endDate } = req.query;

      console.log('\n🔄 Starting GoAudits sync for closed invoice customers...');
      console.log(`   Date range: ${startDate || 'all'} to ${endDate || 'all'}`);

      // Get customers from closed invoices
      const customers = await routeStarCustomerService.getCustomersFromClosedInvoices(
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null
      );

      if (!customers || customers.length === 0) {
        console.log('   No customers found to sync');
        return res.json({
          success: true,
          message: 'No customers found to sync',
          data: {
            total: 0,
            created: 0,
            mapped_existing: 0,
            already_exists: 0,
            errors: 0,
            details: []
          }
        });
      }

      console.log(`   Found ${customers.length} customers to sync`);

      // Sync to GoAudits
      const results = await goAuditsService.syncCustomersToLocations(customers);

      console.log('\n✓ Sync completed:');
      console.log(`   Created: ${results.created}`);
      console.log(`   Mapped existing: ${results.mapped_existing}`);
      console.log(`   Already exists: ${results.already_exists}`);
      console.log(`   Errors: ${results.errors}`);

      res.json({
        success: true,
        message: `Sync completed: ${results.created} created, ${results.mapped_existing} mapped, ${results.already_exists} already existed, ${results.errors} errors`,
        data: results
      });

    } catch (error) {
      console.error('❌ Error syncing customers to GoAudits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync customers to GoAudits',
        error: error.message
      });
    }
  }

  /**
   * Sync a single customer to GoAudits
   */
  async syncSingleCustomer(req, res, next) {
    try {
      const { customerId } = req.params;

      console.log(`\n🔄 Syncing single customer ${customerId} to GoAudits...`);

      // Get customer details
      const customer = await routeStarCustomerService.getCustomerById(customerId);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Sync to GoAudits
      const result = await goAuditsService.syncCustomerToLocation(customer);

      res.json({
        success: result.success,
        message: result.message,
        data: result
      });

    } catch (error) {
      console.error('Error syncing customer to GoAudits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync customer to GoAudits',
        error: error.message
      });
    }
  }

  /**
   * Remove sync mapping (doesn't delete from GoAudits)
   */
  async removeSyncMapping(req, res, next) {
    try {
      const { customerId } = req.params;

      const result = await GoAuditsLocation.findOneAndDelete({
        routeStarCustomerId: customerId
      });

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Sync mapping not found'
        });
      }

      res.json({
        success: true,
        message: 'Sync mapping removed successfully',
        data: result
      });

    } catch (error) {
      console.error('Error removing sync mapping:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove sync mapping',
        error: error.message
      });
    }
  }

  /**
   * Test GoAudits authentication
   */
  async testAuthentication(req, res, next) {
    try {
      await goAuditsService.authenticate();

      res.json({
        success: true,
        message: 'GoAudits authentication successful',
        companyId: goAuditsService.companyId
      });
    } catch (error) {
      console.error('Error testing GoAudits authentication:', error);
      res.status(500).json({
        success: false,
        message: 'GoAudits authentication failed',
        error: error.message
      });
    }
  }
}

module.exports = new GoAuditsController();
