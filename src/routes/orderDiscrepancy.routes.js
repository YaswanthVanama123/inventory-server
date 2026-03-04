const express = require('express');
const router = express.Router();
const orderDiscrepancyController = require('../controllers/orderDiscrepancyController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * Order Discrepancy Routes
 * For tracking and managing discrepancies in received purchase orders
 */

// Get order discrepancy statistics
router.get('/stats', authenticate, orderDiscrepancyController.getOrderDiscrepancyStats);

// Get all order discrepancies with filters
router.get('/', authenticate, orderDiscrepancyController.getOrderDiscrepancies);

// Get single order discrepancy
router.get('/:id', authenticate, orderDiscrepancyController.getOrderDiscrepancyById);

// Get discrepancies by order ID
router.get('/by-order/:orderId', authenticate, orderDiscrepancyController.getOrderDiscrepanciesByOrderId);

// Verify/check order items (create discrepancies or mark as all good)
router.post('/verify/:orderId', authenticate, orderDiscrepancyController.verifyOrder);

// Approve order discrepancy (admin only)
router.post('/:id/approve', authenticate, requireAdmin(), orderDiscrepancyController.approveOrderDiscrepancy);

// Reject order discrepancy (admin only)
router.post('/:id/reject', authenticate, requireAdmin(), orderDiscrepancyController.rejectOrderDiscrepancy);

module.exports = router;
