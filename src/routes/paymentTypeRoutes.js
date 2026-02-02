const express = require('express');
const router = express.Router();
const paymentTypeController = require('../controllers/paymentTypeController');
const { authenticate, requireRole } = require('../middleware/auth');


router.use(authenticate);


router.get('/', paymentTypeController.getAllPaymentTypes);


router.get('/:id', paymentTypeController.getPaymentTypeById);


router.use(requireRole('admin'));


router.post('/', paymentTypeController.createPaymentType);


router.put('/:id', paymentTypeController.updatePaymentType);


router.delete('/:id', paymentTypeController.deletePaymentType);

module.exports = router;
