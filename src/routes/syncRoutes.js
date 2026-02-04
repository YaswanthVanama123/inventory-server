const express = require('express');
const router = express.Router();
const {
  syncCustomerConnect,
  syncRouteStar,
  getSyncLogs,
  getSyncStatus,
  getSyncStats
} = require('../controllers/syncController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Trigger syncs (admin only)
router.post('/sync/customerconnect', authenticate, requireAdmin(), syncCustomerConnect);
router.post('/sync/routestar', authenticate, requireAdmin(), syncRouteStar);

// Get sync information (admin only)
router.get('/sync/logs', authenticate, requireAdmin(), getSyncLogs);
router.get('/sync/status', authenticate, requireAdmin(), getSyncStatus);
router.get('/sync/stats', authenticate, requireAdmin(), getSyncStats);

module.exports = router;
