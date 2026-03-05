const modelCategoryService = require('../services/modelCategory.service');


class ModelCategoryController {
  async getUniqueModels(req, res, next) {
    try {
      const data = await modelCategoryService.getUniqueModels();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching unique models:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch unique model numbers',
        error: error.message
      });
    }
  }
  async getRouteStarItems(req, res, next) {
    try {
      const data = await modelCategoryService.getRouteStarItems();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching RouteStarItems:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch RouteStar items',
        error: error.message
      });
    }
  }
  async saveMapping(req, res, next) {
    try {
      const mapping = await modelCategoryService.saveMapping(
        req.body,
        req.user._id
      );
      res.json({
        success: true,
        message: 'Mapping saved successfully',
        data: mapping
      });
    } catch (error) {
      console.error('Error saving mapping:', error);
      if (error.message === 'Model number is required') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to save mapping',
        error: error.message
      });
    }
  }
  async deleteMapping(req, res, next) {
    try {
      const result = await modelCategoryService.deleteMapping(req.params.modelNumber);
      res.json({
        success: true,
        message: 'Mapping deleted successfully',
        data: result
      });
    } catch (error) {
      console.error('Error deleting mapping:', error);
      if (error.message === 'Mapping not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to delete mapping',
        error: error.message
      });
    }
  }
  async getAllMappings(req, res, next) {
    try {
      const data = await modelCategoryService.getAllMappings();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching mappings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch mappings',
        error: error.message
      });
    }
  }
}
module.exports = new ModelCategoryController();
