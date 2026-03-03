const express = require('express');
const router = express.Router();
const inventorySchedulerController = require('../controllers/inventorySchedulerController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * Inventory Scheduler Routes
 * Clean routes with no business logic - delegates to controller
 */

// Get scheduler status
router.get('/status', authenticate, requireAdmin(), inventorySchedulerController.getStatus);

// Start scheduler
router.post('/start', authenticate, requireAdmin(), inventorySchedulerController.startScheduler);

// Stop scheduler
router.post('/stop', authenticate, requireAdmin(), inventorySchedulerController.stopScheduler);

// Run scheduler immediately
router.post('/run-now', authenticate, requireAdmin(), inventorySchedulerController.runNow);

module.exports = router;
