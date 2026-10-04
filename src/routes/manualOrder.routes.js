const express = require('express');
const router = express.Router();
const manualOrderController = require('../controllers/manualOrderController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/next-number', authenticate, manualOrderController.getNextOrderNumber);

router.get('/', authenticate, manualOrderController.getAllManualOrders);

router.get('/:orderNumber', authenticate, manualOrderController.getManualOrderByNumber);

router.post('/', authenticate, requireAdmin(), manualOrderController.createManualOrder);

router.put('/:orderNumber', authenticate, requireAdmin(), manualOrderController.updateManualOrder);

router.delete('/:orderNumber', authenticate, requireAdmin(), manualOrderController.deleteManualOrder);

module.exports = router;
