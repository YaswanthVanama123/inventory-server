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
  mapSKU
} = require('../controllers/warehouseController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Purchase Orders
router.get('/warehouse/purchase-orders', authenticate, getPurchaseOrders);
router.get('/warehouse/purchase-orders/:id', authenticate, getPurchaseOrder);

// External Invoices (from RouteStar)
router.get('/warehouse/invoices', authenticate, getExternalInvoices);
router.get('/warehouse/invoices/:id', authenticate, getExternalInvoice);

// Stock
router.get('/warehouse/stock', authenticate, getStockSummary);
router.get('/warehouse/stock/:sku/movements', authenticate, getStockMovements);
router.post('/warehouse/stock/:sku/adjust', authenticate, requireAdmin(), createStockAdjustment);

// Sales & Reports
router.get('/warehouse/sales/summary', authenticate, getSalesSummary);

// SKU Mapping (admin only)
router.get('/warehouse/unmapped-products', authenticate, requireAdmin(), getUnmappedProducts);
router.post('/warehouse/map-sku', authenticate, requireAdmin(), mapSKU);

module.exports = router;
