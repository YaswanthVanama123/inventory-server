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
const { setActivityMeta } = require('../middleware/activityLogger');

router.post('/inventory/:inventoryId/purchases', authenticate, requireAdmin(), setActivityMeta('CREATE', 'PURCHASE'), createPurchase);

router.get('/inventory/:inventoryId/purchases', authenticate, setActivityMeta('VIEW', 'PURCHASE'), getPurchasesByInventoryItem);
router.get('/purchases/:purchaseId', authenticate, setActivityMeta('VIEW', 'PURCHASE'), getPurchase);
router.put('/purchases/:purchaseId', authenticate, requireAdmin(), setActivityMeta('UPDATE', 'PURCHASE'), updatePurchase);
router.delete('/purchases/:purchaseId', authenticate, requireAdmin(), setActivityMeta('DELETE', 'PURCHASE'), deletePurchase);
module.exports = router;
