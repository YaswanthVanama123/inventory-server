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


router.get('/warehouse/purchase-orders', authenticate, getPurchaseOrders);
router.get('/warehouse/purchase-orders/:id', authenticate, getPurchaseOrder);


router.get('/warehouse/invoices', authenticate, getExternalInvoices);
router.get('/warehouse/invoices/:id', authenticate, getExternalInvoice);


router.get('/warehouse/stock', authenticate, getStockSummary);
router.get('/warehouse/stock/:sku/movements', authenticate, getStockMovements);
router.post('/warehouse/stock/:sku/adjust', authenticate, requireAdmin(), createStockAdjustment);


router.get('/warehouse/sales/summary', authenticate, getSalesSummary);


router.get('/warehouse/unmapped-products', authenticate, requireAdmin(), getUnmappedProducts);
router.post('/warehouse/map-sku', authenticate, requireAdmin(), mapSKU);


router.get('/warehouse/sync/health', authenticate, requireAdmin(), getSyncHealth);
router.get('/warehouse/sync/stats', authenticate, requireAdmin(), getSyncStats);
router.get('/warehouse/sync/unprocessed', authenticate, requireAdmin(), getUnprocessedSyncItems);
router.post('/warehouse/sync/retry-processing', authenticate, requireAdmin(), retrySyncProcessing);

module.exports = router;
