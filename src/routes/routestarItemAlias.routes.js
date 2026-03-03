const express = require('express');
const router = express.Router();
const routeStarItemAliasController = require('../controllers/routeStarItemAliasController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * RouteStar Item Alias Routes
 * Clean routes with no business logic - delegates to controller
 */

// Get all active mappings
router.get('/mappings', authenticate, routeStarItemAliasController.getAllMappings);

// Get unique items with mapping status
router.get('/unique-items', authenticate, routeStarItemAliasController.getUniqueItems);

// Create or update a mapping
router.post('/mapping', authenticate, requireAdmin(), routeStarItemAliasController.createMapping);

// Update a mapping
router.put('/mapping/:id', authenticate, requireAdmin(), routeStarItemAliasController.updateMapping);

// Add alias to existing mapping
router.post('/mapping/:id/add-alias', authenticate, requireAdmin(), routeStarItemAliasController.addAlias);

// Remove alias from mapping
router.delete('/mapping/:id/alias/:aliasName', authenticate, requireAdmin(), routeStarItemAliasController.removeAlias);

// Delete a mapping
router.delete('/mapping/:id', authenticate, requireAdmin(), routeStarItemAliasController.deleteMapping);

// Get lookup map
router.get('/lookup-map', authenticate, routeStarItemAliasController.getLookupMap);

// Get suggested mappings
router.get('/suggested-mappings', authenticate, routeStarItemAliasController.getSuggestedMappings);

// Get statistics
router.get('/stats', authenticate, routeStarItemAliasController.getStats);

module.exports = router;
