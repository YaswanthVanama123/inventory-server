const express = require('express');
const router = express.Router();
const {
  createPurchase,
  getPurchasesByInventoryItem,
  getPurchase,
  updatePurchase,
  deletePurchase
} = require('../controllers/purchaseController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.post('/inventory/:inventoryId/purchases', authenticate, requireAdmin(), createPurchase);

router.get('/inventory/:inventoryId/purchases', authenticate, getPurchasesByInventoryItem);

router.get('/purchases/:purchaseId', authenticate, getPurchase);

router.put('/purchases/:purchaseId', authenticate, requireAdmin(), updatePurchase);

router.delete('/purchases/:purchaseId', authenticate, requireAdmin(), deletePurchase);

module.exports = router;
