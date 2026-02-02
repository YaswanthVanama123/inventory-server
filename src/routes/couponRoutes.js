const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authenticate, requireRole } = require('../middleware/auth');


router.use(authenticate);
router.use(requireRole('admin'));


router.get('/', couponController.getAllCoupons);


router.get('/stats', couponController.getCouponStats);


router.post('/validate', couponController.validateCoupon);


router.get('/:id', couponController.getCouponById);


router.post('/', couponController.createCoupon);


router.put('/:id', couponController.updateCoupon);


router.delete('/:id', couponController.deleteCoupon);


router.post('/:id/use', couponController.incrementUsage);

module.exports = router;
