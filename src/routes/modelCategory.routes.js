const express = require('express');
const router = express.Router();
const modelCategoryController = require('../controllers/modelCategoryController');
const { authenticate } = require('../middleware/auth');

/**
 * Model Category Routes
 * Clean routes with no business logic - delegates to controller
 */

// Get unique models from orders with mapping status
router.get('/unique-models', authenticate, modelCategoryController.getUniqueModels);

// Get RouteStarItems with mapping status
router.get('/routestar-items', authenticate, modelCategoryController.getRouteStarItems);

// Create or update a model category mapping
router.post('/mapping', authenticate, modelCategoryController.saveMapping);

// Delete a model category mapping
router.delete('/mapping/:modelNumber', authenticate, modelCategoryController.deleteMapping);

// Get all model category mappings
router.get('/mappings', authenticate, modelCategoryController.getAllMappings);

module.exports = router;
