const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authenticate, requireRole } = require('../middleware/auth');
const { setActivityMeta } = require('../middleware/activityLogger');


router.use(authenticate);
router.use(requireRole('admin'));
router.get('/', setActivityMeta('VIEW', 'COUPON'), couponController.getAllCoupons);
router.get('/stats', setActivityMeta('VIEW', 'COUPON_STATS'), couponController.getCouponStats);
router.post('/validate', setActivityMeta('VALIDATE', 'COUPON'), couponController.validateCoupon);
router.get('/:id', setActivityMeta('VIEW', 'COUPON'), couponController.getCouponById);
router.post('/', setActivityMeta('CREATE', 'COUPON'), couponController.createCoupon);
router.put('/:id', setActivityMeta('UPDATE', 'COUPON'), couponController.updateCoupon);
router.delete('/:id', setActivityMeta('DELETE', 'COUPON'), couponController.deleteCoupon);
router.post('/:id/use', setActivityMeta('USE', 'COUPON'), couponController.incrementUsage);
module.exports = router;
