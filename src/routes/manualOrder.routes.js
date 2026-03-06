const express = require('express');
const router = express.Router();
const manualOrderController = require('../controllers/manualOrderController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Get next available order number
router.get('/next-number', authenticate, manualOrderController.getNextOrderNumber);

// Get all manual orders (with optional filters)
router.get('/', authenticate, manualOrderController.getAllManualOrders);

// Get single manual order by order number
router.get('/:orderNumber', authenticate, manualOrderController.getManualOrderByNumber);

// Create new manual order (admin only)
router.post('/', authenticate, requireAdmin(), manualOrderController.createManualOrder);

// Update manual order (admin only)
router.put('/:orderNumber', authenticate, requireAdmin(), manualOrderController.updateManualOrder);

// Delete manual order (admin only)
router.delete('/:orderNumber', authenticate, requireAdmin(), manualOrderController.deleteManualOrder);

module.exports = router;
