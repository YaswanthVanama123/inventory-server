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
  exportReportToPDF
} = require('../controllers/reportController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Recent activity - available to all authenticated users
router.get('/recent-activity', authenticate, getRecentActivity);

// All other routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin());

// Dashboard and existing reports
router.get('/dashboard', getDashboard);
router.get('/stock-summary', getStockSummary);
router.get('/profit-margin', getProfitMarginReport);
router.get('/reorder-list', getReorderList);
router.get('/audit-logs', getAuditLogs);

// New report routes
router.get('/sales', getSalesReport);
router.get('/valuation', getInventoryValuation);
router.get('/top-selling', getTopSellingItems);
router.get('/customers', getCustomerReport);
router.get('/low-stock', getLowStockReport);
router.get('/profit-analysis', getProfitAnalysis);

// Export routes
router.get('/:type/export/csv', exportReportToCSV);
router.get('/:type/export/pdf', exportReportToPDF);

module.exports = router;
