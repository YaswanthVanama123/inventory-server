const express = require('express');
const router = express.Router();
const manualPurchaseOrderItemController = require('../controllers/manualPurchaseOrderItemController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Get all page data (items + routestar items + vendors) in one call
router.get('/page-data', authenticate, manualPurchaseOrderItemController.getPageData);

// Get all manual PO items
router.get('/', authenticate, manualPurchaseOrderItemController.getAllItems);

// Get active manual PO items (for dropdown)
router.get('/active', authenticate, manualPurchaseOrderItemController.getActiveItems);

// Get RouteStar items for mapping dropdown
router.get('/routestar-items', authenticate, manualPurchaseOrderItemController.getRouteStarItems);

// Get single manual PO item by SKU
router.get('/:sku', authenticate, manualPurchaseOrderItemController.getItemBySku);

// Create new manual PO item (admin only)
router.post('/', authenticate, requireAdmin(), manualPurchaseOrderItemController.createItem);

// Update manual PO item (admin only)
router.put('/:sku', authenticate, requireAdmin(), manualPurchaseOrderItemController.updateItem);

// Delete manual PO item (admin only)
router.delete('/:sku', authenticate, requireAdmin(), manualPurchaseOrderItemController.deleteItem);

module.exports = router;
