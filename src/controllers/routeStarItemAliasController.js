const routeStarItemAliasService = require('../services/routeStarItemAlias.service');

/**
 * RouteStar Item Alias Controller
 * Handles HTTP requests for item alias mapping operations
 */
class RouteStarItemAliasController {
  /**
   * Get all active mappings
   * GET /api/routestar-item-alias/mappings
   */
  async getAllMappings(req, res, next) {
    try {
      const data = await routeStarItemAliasService.getAllMappings();

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

  /**
   * Get unique items with mapping status
   * GET /api/routestar-item-alias/unique-items
   */
  async getUniqueItems(req, res, next) {
    try {
      const data = await routeStarItemAliasService.getUniqueItems();

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching unique items:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch unique items',
        error: error.message
      });
    }
  }

  /**
   * Create or update a mapping
   * POST /api/routestar-item-alias/mapping
   */
  async createMapping(req, res, next) {
    try {
      const mapping = await routeStarItemAliasService.createMapping(
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

      if (error.message.includes('Canonical name and at least one alias are required')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      if (error.conflictingMappings) {
        return res.status(400).json({
          success: false,
          message: error.message,
          conflictingMappings: error.conflictingMappings
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to save mapping',
        error: error.message
      });
    }
  }

  /**
   * Update a mapping
   * PUT /api/routestar-item-alias/mapping/:id
   */
  async updateMapping(req, res, next) {
    try {
      const mapping = await routeStarItemAliasService.updateMapping(
        req.params.id,
        req.body,
        req.user._id
      );

      res.json({
        success: true,
        message: 'Mapping updated successfully',
        data: mapping
      });
    } catch (error) {
      console.error('Error updating mapping:', error);

      if (error.message === 'Mapping not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update mapping',
        error: error.message
      });
    }
  }

  /**
   * Add alias to existing mapping
   * POST /api/routestar-item-alias/mapping/:id/add-alias
   */
  async addAlias(req, res, next) {
    try {
      const mapping = await routeStarItemAliasService.addAlias(
        req.params.id,
        req.body
      );

      res.json({
        success: true,
        message: 'Alias added successfully',
        data: mapping
      });
    } catch (error) {
      console.error('Error adding alias:', error);

      if (error.message === 'Alias name is required') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Mapping not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to add alias',
        error: error.message
      });
    }
  }

  /**
   * Remove alias from mapping
   * DELETE /api/routestar-item-alias/mapping/:id/alias/:aliasName
   */
  async removeAlias(req, res, next) {
    try {
      const mapping = await routeStarItemAliasService.removeAlias(
        req.params.id,
        req.params.aliasName
      );

      res.json({
        success: true,
        message: 'Alias removed successfully',
        data: mapping
      });
    } catch (error) {
      console.error('Error removing alias:', error);

      if (error.message === 'Mapping not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to remove alias',
        error: error.message
      });
    }
  }

  /**
   * Delete a mapping
   * DELETE /api/routestar-item-alias/mapping/:id
   */
  async deleteMapping(req, res, next) {
    try {
      const mapping = await routeStarItemAliasService.deleteMapping(req.params.id);

      res.json({
        success: true,
        message: 'Mapping deleted successfully',
        data: mapping
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

  /**
   * Get lookup map
   * GET /api/routestar-item-alias/lookup-map
   */
  async getLookupMap(req, res, next) {
    try {
      const data = await routeStarItemAliasService.getLookupMap();

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error building lookup map:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to build lookup map',
        error: error.message
      });
    }
  }

  /**
   * Get suggested mappings
   * GET /api/routestar-item-alias/suggested-mappings
   */
  async getSuggestedMappings(req, res, next) {
    try {
      const data = await routeStarItemAliasService.getSuggestedMappings();

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error getting suggested mappings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get suggested mappings',
        error: error.message
      });
    }
  }

  /**
   * Get statistics
   * GET /api/routestar-item-alias/stats
   */
  async getStats(req, res, next) {
    try {
      const data = await routeStarItemAliasService.getStats();

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }
  }
}

module.exports = new RouteStarItemAliasController();
