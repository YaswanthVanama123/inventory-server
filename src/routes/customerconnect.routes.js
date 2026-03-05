const express = require('express');
const router = express.Router();
const customerConnectController = require('../controllers/customerConnectController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.post('/sync/orders', authenticate, requireAdmin(), customerConnectController.syncOrders);
router.get('/order-range', authenticate, customerConnectController.getOrderRange);
router.post('/sync/details/:orderNumber', authenticate, requireAdmin(), customerConnectController.syncOrderDetails);
router.post('/sync/all-details', authenticate, requireAdmin(), customerConnectController.syncAllOrderDetails);
router.post('/sync/stock', authenticate, requireAdmin(), customerConnectController.syncStock);
router.post('/sync/full', authenticate, requireAdmin(), customerConnectController.fullSync);
router.get('/orders', authenticate, customerConnectController.getOrders);
router.get('/orders/:orderNumber', authenticate, customerConnectController.getOrderByNumber);
router.get('/stats', authenticate, customerConnectController.getStats);
router.get('/items/grouped', authenticate, customerConnectController.getGroupedItems);
router.post('/orders/bulk-delete', authenticate, requireAdmin(), customerConnectController.bulkDeleteBySKUs);
router.post('/orders/bulk-delete-by-numbers', authenticate, requireAdmin(), customerConnectController.bulkDeleteByOrderNumbers);
router.get('/items/:sku/orders', authenticate, customerConnectController.getOrdersBySKU);
router.delete('/orders/all', authenticate, requireAdmin(), customerConnectController.deleteAllOrders);
module.exports = router;
