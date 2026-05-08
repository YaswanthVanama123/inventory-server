const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getStockSummary,
  getProfitMarginReport,
  getReorderList,
  getAuditLogs,
  getSalesReport,
  getInventoryValuation,
  getTopSellingItems,
  getCustomerReport,
  getLowStockReport,
  getProfitAnalysis,
  getRecentActivity,
  exportReportToCSV,
  exportReportToPDF,
  getInventorySyncStatus,
  getSyncHistory,
  getStockProcessingStatus,
  getDashboardSyncWidget,
  exportCustomers
} = require('../controllers/reportController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { setActivityMeta } = require('../middleware/activityLogger');


router.get('/recent-activity', authenticate, setActivityMeta('VIEW', 'REPORT'), getRecentActivity);
router.get('/dashboard', authenticate, setActivityMeta('VIEW', 'DASHBOARD'), getDashboard);
router.use(authenticate);
router.use(requireAdmin());
router.get('/dashboard-sync-widget', setActivityMeta('VIEW', 'DASHBOARD'), getDashboardSyncWidget);
router.get('/stock-summary', setActivityMeta('VIEW', 'REPORT'), getStockSummary);
router.get('/profit-margin', setActivityMeta('VIEW', 'REPORT'), getProfitMarginReport);
router.get('/reorder-list', setActivityMeta('VIEW', 'REPORT'), getReorderList);
router.get('/audit-logs', setActivityMeta('VIEW', 'REPORT'), getAuditLogs);
router.get('/sales', setActivityMeta('VIEW', 'REPORT'), getSalesReport);
router.get('/valuation', setActivityMeta('VIEW', 'REPORT'), getInventoryValuation);
router.get('/top-selling', setActivityMeta('VIEW', 'REPORT'), getTopSellingItems);
router.get('/customers', setActivityMeta('VIEW', 'REPORT'), getCustomerReport);
router.get('/low-stock', setActivityMeta('VIEW', 'REPORT'), getLowStockReport);
router.get('/profit-analysis', setActivityMeta('VIEW', 'REPORT'), getProfitAnalysis);
router.get('/inventory-sync-status', setActivityMeta('VIEW', 'REPORT'), getInventorySyncStatus);
router.get('/sync-history', setActivityMeta('VIEW', 'REPORT'), getSyncHistory);
router.get('/stock-processing-status', setActivityMeta('VIEW', 'REPORT'), getStockProcessingStatus);
router.get('/export-customers', setActivityMeta('EXPORT', 'REPORT'), exportCustomers);
router.get('/:type/export/csv', setActivityMeta('EXPORT', 'REPORT'), exportReportToCSV);
router.get('/:type/export/pdf', setActivityMeta('EXPORT', 'REPORT'), exportReportToPDF);
module.exports = router;
