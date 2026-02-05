const express = require('express');
const router = express.Router();
const {
  getPendingPurchaseDeletions,
  approvePurchaseDeletion,
  rejectPurchaseDeletion
} = require('../controllers/approvalController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.get('/approvals/purchases/pending', authenticate, requireAdmin(), getPendingPurchaseDeletions);


router.post('/approvals/purchases/:purchaseId/approve', authenticate, requireAdmin(), approvePurchaseDeletion);


router.post('/approvals/purchases/:purchaseId/reject', authenticate, requireAdmin(), rejectPurchaseDeletion);

module.exports = router;
