const express = require('express');
const router = express.Router();
const inventorySchedulerController = require('../controllers/inventorySchedulerController');
const { authenticate, requireAdmin } = require('../middleware/auth');




router.get('/status', authenticate, requireAdmin(), inventorySchedulerController.getStatus);


router.post('/start', authenticate, requireAdmin(), inventorySchedulerController.startScheduler);


router.post('/stop', authenticate, requireAdmin(), inventorySchedulerController.stopScheduler);


router.post('/run-now', authenticate, requireAdmin(), inventorySchedulerController.runNow);

module.exports = router;
