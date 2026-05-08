const express = require('express');
const router = express.Router();
const {
  getPurchaseOrders,
  getPurchaseOrder,
  getExternalInvoices,
  getExternalInvoice,
  getStockSummary,
  getStockMovements,
  createStockAdjustment,
  getSalesSummary,
  getUnmappedProducts,
  mapSKU,
  getSyncHealth,
  getSyncStats,
  getUnprocessedSyncItems,
  retrySyncProcessing
} = require('../controllers/warehouseController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { setActivityMeta } = require('../middleware/activityLogger');


router.get('/warehouse/purchase-orders', authenticate, setActivityMeta('VIEW', 'PURCHASE_ORDERS'), getPurchaseOrders);
router.get('/warehouse/purchase-orders/:id', authenticate, setActivityMeta('VIEW', 'PURCHASE_ORDER'), getPurchaseOrder);
router.get('/warehouse/invoices', authenticate, setActivityMeta('VIEW', 'EXTERNAL_INVOICES'), getExternalInvoices);
router.get('/warehouse/invoices/:id', authenticate, setActivityMeta('VIEW', 'EXTERNAL_INVOICE'), getExternalInvoice);
router.get('/warehouse/stock', authenticate, setActivityMeta('VIEW', 'WAREHOUSE_STOCK'), getStockSummary);
router.get('/warehouse/stock/:sku/movements', authenticate, setActivityMeta('VIEW', 'WAREHOUSE_STOCK_MOVEMENTS'), getStockMovements);
router.post('/warehouse/stock/:sku/adjust', authenticate, requireAdmin(), setActivityMeta('CREATE', 'STOCK_ADJUSTMENT'), createStockAdjustment);
router.get('/warehouse/sales/summary', authenticate, setActivityMeta('VIEW', 'SALES_SUMMARY'), getSalesSummary);
router.get('/warehouse/unmapped-products', authenticate, requireAdmin(), setActivityMeta('VIEW', 'UNMAPPED_PRODUCTS'), getUnmappedProducts);
router.post('/warehouse/map-sku', authenticate, requireAdmin(), setActivityMeta('CREATE', 'SKU_MAPPING'), mapSKU);
router.get('/warehouse/sync/health', authenticate, requireAdmin(), setActivityMeta('VIEW', 'WAREHOUSE_SYNC_HEALTH'), getSyncHealth);
router.get('/warehouse/sync/stats', authenticate, requireAdmin(), setActivityMeta('VIEW', 'WAREHOUSE_SYNC_STATS'), getSyncStats);
router.get('/warehouse/sync/unprocessed', authenticate, requireAdmin(), setActivityMeta('VIEW', 'UNPROCESSED_SYNC_ITEMS'), getUnprocessedSyncItems);
router.post('/warehouse/sync/retry-processing', authenticate, requireAdmin(), setActivityMeta('RETRY', 'SYNC_PROCESSING'), retrySyncProcessing);
module.exports = router;
