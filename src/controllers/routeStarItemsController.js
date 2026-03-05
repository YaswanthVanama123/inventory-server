const routeStarItemsService = require('../services/routeStarItems.service');


let isSyncing = false;
class RouteStarItemsController {
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
  async syncItems(req, res, next) {
    if (isSyncing) {
      return res.status(409).json({
        success: false,
        message: 'Sync already in progress. Please wait for the current sync to complete.',
        error: 'SYNC_IN_PROGRESS'
      });
    }
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
      isSyncing = false;
    }
  }
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
