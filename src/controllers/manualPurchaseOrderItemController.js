const manualPurchaseOrderItemService = require('../services/manualPurchaseOrderItem.service');

class ManualPurchaseOrderItemController {
  async createItem(req, res, next) {
    try {
      const item = await manualPurchaseOrderItemService.createItem(
        req.body,
        req.user._id
      );

      res.status(201).json({
        success: true,
        message: 'Manual PO item created successfully',
        data: item
      });
    } catch (error) {
      console.error('Error creating manual PO item:', error);
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      if (error.message.includes('required')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to create manual PO item',
        error: error.message
      });
    }
  }

  async getAllItems(req, res, next) {
    try {
      const data = await manualPurchaseOrderItemService.getAllItems();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching manual PO items:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch manual PO items',
        error: error.message
      });
    }
  }

  async getActiveItems(req, res, next) {
    try {
      const data = await manualPurchaseOrderItemService.getActiveItems();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching active manual PO items:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active manual PO items',
        error: error.message
      });
    }
  }

  async getItemBySku(req, res, next) {
    try {
      const item = await manualPurchaseOrderItemService.getItemBySku(req.params.sku);
      res.json({
        success: true,
        data: item
      });
    } catch (error) {
      console.error('Error fetching manual PO item:', error);
      if (error.message === 'Item not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to fetch manual PO item',
        error: error.message
      });
    }
  }

  async updateItem(req, res, next) {
    try {
      const item = await manualPurchaseOrderItemService.updateItem(
        req.params.sku,
        req.body,
        req.user._id
      );
      res.json({
        success: true,
        message: 'Manual PO item updated successfully',
        data: item
      });
    } catch (error) {
      console.error('Error updating manual PO item:', error);
      if (error.message === 'Item not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to update manual PO item',
        error: error.message
      });
    }
  }

  async deleteItem(req, res, next) {
    try {
      const result = await manualPurchaseOrderItemService.deleteItem(req.params.sku);
      res.json({
        success: true,
        message: 'Manual PO item deleted successfully',
        data: result
      });
    } catch (error) {
      console.error('Error deleting manual PO item:', error);
      if (error.message === 'Item not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to delete manual PO item',
        error: error.message
      });
    }
  }

  async getRouteStarItems(req, res, next) {
    try {
      const data = await manualPurchaseOrderItemService.getRouteStarItems();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching RouteStar items:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch RouteStar items',
        error: error.message
      });
    }
  }

  async getPageData(req, res, next) {
    try {
      const data = await manualPurchaseOrderItemService.getPageData();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching page data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch page data',
        error: error.message
      });
    }
  }
}

module.exports = new ManualPurchaseOrderItemController();
