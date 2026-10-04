const express = require('express');
const router = express.Router();
const manualPurchaseOrderItemController = require('../controllers/manualPurchaseOrderItemController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/page-data', authenticate, manualPurchaseOrderItemController.getPageData);

router.get('/', authenticate, manualPurchaseOrderItemController.getAllItems);

router.get('/active', authenticate, manualPurchaseOrderItemController.getActiveItems);

router.get('/routestar-items', authenticate, manualPurchaseOrderItemController.getRouteStarItems);

router.get('/:sku', authenticate, manualPurchaseOrderItemController.getItemBySku);

router.post('/', authenticate, requireAdmin(), manualPurchaseOrderItemController.createItem);

router.put('/:sku', authenticate, requireAdmin(), manualPurchaseOrderItemController.updateItem);

router.delete('/:sku', authenticate, requireAdmin(), manualPurchaseOrderItemController.deleteItem);

module.exports = router;
