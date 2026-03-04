const express = require('express');
const router = express.Router();
const routeStarItemsController = require('../controllers/routeStarItemsController');
const { authenticate } = require('../middleware/auth');

/**
 * RouteStar Items Routes
 * Clean routes with no business logic - delegates to controller
 */

// Get combined page data (items + stats in one call)
router.get('/page-data', authenticate, routeStarItemsController.getItemsWithStats);

// Get item statistics
router.get('/stats', authenticate, routeStarItemsController.getItemStats);

// Get items with filtering and pagination
router.get('/', authenticate, routeStarItemsController.getItems);

// Update item flags
router.patch('/:id/flags', authenticate, routeStarItemsController.updateItemFlags);

// Delete all items
router.delete('/all', authenticate, routeStarItemsController.deleteAllItems);

// Sync items from RouteStar
router.post('/sync', authenticate, routeStarItemsController.syncItems);

// Get sales report
router.get('/sales-report', authenticate, routeStarItemsController.getSalesReport);

module.exports = router;
