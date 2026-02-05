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
  getDashboardSyncWidget
} = require('../controllers/reportController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.get('/recent-activity', authenticate, getRecentActivity);


router.use(authenticate);
router.use(requireAdmin());


router.get('/dashboard', getDashboard);
router.get('/dashboard-sync-widget', getDashboardSyncWidget);
router.get('/stock-summary', getStockSummary);
router.get('/profit-margin', getProfitMarginReport);
router.get('/reorder-list', getReorderList);
router.get('/audit-logs', getAuditLogs);


router.get('/sales', getSalesReport);
router.get('/valuation', getInventoryValuation);
router.get('/top-selling', getTopSellingItems);
router.get('/customers', getCustomerReport);
router.get('/low-stock', getLowStockReport);
router.get('/profit-analysis', getProfitAnalysis);


router.get('/inventory-sync-status', getInventorySyncStatus);
router.get('/sync-history', getSyncHistory);
router.get('/stock-processing-status', getStockProcessingStatus);


router.get('/:type/export/csv', exportReportToCSV);
router.get('/:type/export/pdf', exportReportToPDF);

module.exports = router;
