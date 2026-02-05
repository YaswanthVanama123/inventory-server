const express = require('express');
const router = express.Router();
const {
  syncCustomerConnect,
  syncRouteStar,
  getSyncLogs,
  getSyncStatus,
  getSyncStats,
  getSyncHealth,
  retryFailedSyncs,
  reprocessFailedStock,
  getSyncPerformanceMetrics,
  getInventoryAnalytics
} = require('../controllers/syncController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.post('/sync/customerconnect', authenticate, requireAdmin(), syncCustomerConnect);
router.post('/sync/routestar', authenticate, requireAdmin(), syncRouteStar);


router.get('/sync/logs', authenticate, requireAdmin(), getSyncLogs);
router.get('/sync/status', authenticate, requireAdmin(), getSyncStatus);
router.get('/sync/stats', authenticate, requireAdmin(), getSyncStats);
router.get('/sync/health', authenticate, requireAdmin(), getSyncHealth);
router.get('/sync/performance', authenticate, requireAdmin(), getSyncPerformanceMetrics);
router.get('/sync/inventory-analytics', authenticate, requireAdmin(), getInventoryAnalytics);


router.post('/sync/retry-failed', authenticate, requireAdmin(), retryFailedSyncs);
router.post('/sync/reprocess-stock', authenticate, requireAdmin(), reprocessFailedStock);

module.exports = router;
