const express = require('express');
const router = express.Router();
const paymentTypeController = require('../controllers/paymentTypeController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get all payment types (accessible to all authenticated users)
router.get('/', paymentTypeController.getAllPaymentTypes);

// Get single payment type
router.get('/:id', paymentTypeController.getPaymentTypeById);

// Admin only routes
router.use(requireRole('admin'));

// Create new payment type
router.post('/', paymentTypeController.createPaymentType);

// Update payment type
router.put('/:id', paymentTypeController.updatePaymentType);

// Delete payment type
router.delete('/:id', paymentTypeController.deletePaymentType);

module.exports = router;
