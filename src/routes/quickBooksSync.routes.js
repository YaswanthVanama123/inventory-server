const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/quickBooksSyncController');

// Admin REST endpoints
router.get('/stats', authenticate, requireAdmin(), controller.getStats);
router.get('/queue', authenticate, requireAdmin(), controller.listQueue);
router.post('/retry/:id', authenticate, requireAdmin(), controller.retry);
router.post('/trigger-snapshot', authenticate, requireAdmin(), controller.triggerSnapshot);

module.exports = router;
