const routeStarItemsService = require('../services/routeStarItems.service');

// Sync state management
let isSyncing = false;

/**
 * RouteStar Items Controller
 * Handles HTTP requests for RouteStar items operations
 */
class RouteStarItemsController {
  /**
   * Get item statistics
   * GET /api/routestar-items/stats
   */
  async getItemStats(req, res, next) {
    try {
      const data = await routeStarItemsService.getItemStats();

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching item stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }
  }

  /**
   * Get items with filtering and pagination
   * GET /api/routestar-items
   */
  async getItems(req, res, next) {
    try {
      const filters = {
        search: req.query.search,
        itemParent: req.query.itemParent,
        type: req.query.type,
        itemCategory: req.query.itemCategory,
        forUse: req.query.forUse,
        forSell: req.query.forSell
      };

      const pagination = {
        page: req.query.page || 1,
        limit: req.query.limit || 50,
        sortBy: req.query.sortBy || 'itemName',
        sortOrder: req.query.sortOrder || 'asc'
      };

      const data = await routeStarItemsService.getItems(filters, pagination);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching RouteStarItems:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch items',
        error: error.message
      });
    }
  }

  /**
   * Update item flags
   * PATCH /api/routestar-items/:id/flags
   */
  async updateItemFlags(req, res, next) {
    try {
      const item = await routeStarItemsService.updateItemFlags(
        req.params.id,
        req.body
      );

      res.json({
        success: true,
        message: 'Item(s) updated successfully',
        data: item
      });
    } catch (error) {
      console.error('Error updating item:', error);

      if (error.message === 'Item not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update item',
        error: error.message
      });
    }
  }

  /**
   * Delete all items
   * DELETE /api/routestar-items/all
   */
  async deleteAllItems(req, res, next) {
    try {
      const result = await routeStarItemsService.deleteAllItems();

      res.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} items`,
        data: result
      });
    } catch (error) {
      console.error('Error deleting all items:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete items',
        error: error.message
      });
    }
  }

  /**
   * Sync items from RouteStar
   * POST /api/routestar-items/sync
   */
  async syncItems(req, res, next) {
    // Check if sync is already in progress
    if (isSyncing) {
      return res.status(409).json({
        success: false,
        message: 'Sync already in progress. Please wait for the current sync to complete.',
        error: 'SYNC_IN_PROGRESS'
      });
    }

    // Set sync flag
    isSyncing = true;

    try {
      const result = await routeStarItemsService.syncItems();

      res.json({
        success: true,
        message: 'Items synced successfully',
        data: result
      });
    } catch (error) {
      console.error('Error syncing items:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync items',
        error: error.message
      });
    } finally {
      // Reset sync flag
      isSyncing = false;
    }
  }

  /**
   * Get sales report
   * GET /api/routestar-items/sales-report
   */
  async getSalesReport(req, res, next) {
    try {
      const data = await routeStarItemsService.getSalesReport();

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching sales report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sales report',
        error: error.message
      });
    }
  }

  /**
   * OPTIMIZED: Get items with stats in one call
   * GET /api/routestar-items/page-data
   * Combines items list and stats into single response
   */
  async getItemsWithStats(req, res, next) {
    try {
      const filters = {
        search: req.query.search,
        itemParent: req.query.itemParent,
        type: req.query.type,
        itemCategory: req.query.itemCategory,
        forUse: req.query.forUse,
        forSell: req.query.forSell
      };

      const pagination = {
        page: req.query.page || 1,
        limit: req.query.limit || 50,
        sortBy: req.query.sortBy || 'itemName',
        sortOrder: req.query.sortOrder || 'asc'
      };

      const data = await routeStarItemsService.getItemsWithStats(filters, pagination);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching items with stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch items with stats',
        error: error.message
      });
    }
  }
}

module.exports = new RouteStarItemsController();
