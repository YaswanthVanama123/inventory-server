const express = require('express');
const router = express.Router();
const orderDiscrepancyController = require('../controllers/orderDiscrepancyController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.get('/stats', authenticate, orderDiscrepancyController.getOrderDiscrepancyStats);
router.get('/', authenticate, orderDiscrepancyController.getOrderDiscrepancies);
router.get('/:id', authenticate, orderDiscrepancyController.getOrderDiscrepancyById);
router.get('/by-order/:orderId', authenticate, orderDiscrepancyController.getOrderDiscrepanciesByOrderId);
router.post('/verify/:orderId', authenticate, orderDiscrepancyController.verifyOrder);
router.post('/:id/approve', authenticate, requireAdmin(), orderDiscrepancyController.approveOrderDiscrepancy);
router.post('/:id/reject', authenticate, requireAdmin(), orderDiscrepancyController.rejectOrderDiscrepancy);
module.exports = router;
