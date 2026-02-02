const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireRole('admin'));

// Get all coupons
router.get('/', couponController.getAllCoupons);

// Get coupon statistics
router.get('/stats', couponController.getCouponStats);

// Validate coupon (can be used by any authenticated user)
router.post('/validate', couponController.validateCoupon);

// Get single coupon
router.get('/:id', couponController.getCouponById);

// Create new coupon
router.post('/', couponController.createCoupon);

// Update coupon
router.put('/:id', couponController.updateCoupon);

// Delete coupon
router.delete('/:id', couponController.deleteCoupon);

// Increment usage count
router.post('/:id/use', couponController.incrementUsage);

module.exports = router;
