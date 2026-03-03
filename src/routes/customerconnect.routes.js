const express = require('express');
const router = express.Router();
const customerConnectController = require('../controllers/customerConnectController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * CustomerConnect Routes
 * Clean routes with no business logic - delegates to controller
 */

// Sync orders from CustomerConnect
router.post('/sync/orders', authenticate, requireAdmin(), customerConnectController.syncOrders);

// Get order range (highest/lowest) - DEPRECATED - Use /orders?includeRange=true instead
router.get('/order-range', authenticate, customerConnectController.getOrderRange);

// Sync single order details
router.post('/sync/details/:orderNumber', authenticate, requireAdmin(), customerConnectController.syncOrderDetails);

// Sync all order details
router.post('/sync/all-details', authenticate, requireAdmin(), customerConnectController.syncAllOrderDetails);

// Process stock movements
router.post('/sync/stock', authenticate, requireAdmin(), customerConnectController.syncStock);

// Full sync (orders + details + stock)
router.post('/sync/full', authenticate, requireAdmin(), customerConnectController.fullSync);

// Get orders with pagination and filtering (optimized with includeRange option)
router.get('/orders', authenticate, customerConnectController.getOrders);

// Get single order by order number
router.get('/orders/:orderNumber', authenticate, customerConnectController.getOrderByNumber);

// Get purchase statistics
router.get('/stats', authenticate, customerConnectController.getStats);

// Get grouped items
router.get('/items/grouped', authenticate, customerConnectController.getGroupedItems);

// Bulk delete orders by SKUs
router.post('/orders/bulk-delete', authenticate, requireAdmin(), customerConnectController.bulkDeleteBySKUs);

// Bulk delete orders by order numbers
router.post('/orders/bulk-delete-by-numbers', authenticate, requireAdmin(), customerConnectController.bulkDeleteByOrderNumbers);

// Get orders for specific SKU
router.get('/items/:sku/orders', authenticate, customerConnectController.getOrdersBySKU);

// Delete all orders
router.delete('/orders/all', authenticate, requireAdmin(), customerConnectController.deleteAllOrders);

module.exports = router;
