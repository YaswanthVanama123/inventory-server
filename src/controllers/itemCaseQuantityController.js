const itemCaseQuantityService = require('../services/itemCaseQuantity.service');

class ItemCaseQuantityController {
  async getPurchasedItems(req, res) {
    try {
      const { page, limit, search, status } = req.query;
      const data = await itemCaseQuantityService.getPurchasedItems({ page, limit, search, status });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching purchased items for case mapping:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch purchased items',
        error: error.message
      });
    }
  }

  async saveMapping(req, res) {
    try {
      const mapping = await itemCaseQuantityService.saveMapping(req.body, req.user._id);
      res.json({
        success: true,
        message: 'Case quantity saved successfully',
        data: mapping
      });
    } catch (error) {
      console.error('Error saving case quantity:', error);
      const isValidation = /required|must be a number/i.test(error.message);
      res.status(isValidation ? 400 : 500).json({
        success: false,
        message: isValidation ? error.message : 'Failed to save case quantity',
        error: error.message
      });
    }
  }

  async bulkSaveMappings(req, res) {
    try {
      const result = await itemCaseQuantityService.bulkSaveMappings(req.body.items, req.user._id);
      res.json({
        success: true,
        message: `Saved ${result.saved} case quantities`,
        data: result
      });
    } catch (error) {
      console.error('Error bulk saving case quantities:', error);
      const isValidation = /No mappings supplied/i.test(error.message);
      res.status(isValidation ? 400 : 500).json({
        success: false,
        message: isValidation ? error.message : 'Failed to save case quantities',
        error: error.message
      });
    }
  }

  async deleteMapping(req, res) {
    try {
      const result = await itemCaseQuantityService.deleteMapping(req.params.sku);
      res.json({
        success: true,
        message: 'Case quantity removed successfully',
        data: result
      });
    } catch (error) {
      console.error('Error deleting case quantity:', error);
      if (error.message === 'Mapping not found') {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to delete case quantity',
        error: error.message
      });
    }
  }

  async getAllMappings(req, res) {
    try {
      const data = await itemCaseQuantityService.getAllMappings(req.query.search);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching case quantity mappings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch case quantity mappings',
        error: error.message
      });
    }
  }
}

module.exports = new ItemCaseQuantityController();
