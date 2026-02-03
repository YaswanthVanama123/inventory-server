const express = require('express');
const router = express.Router();
const {
  getPendingPurchaseDeletions,
  approvePurchaseDeletion,
  rejectPurchaseDeletion
} = require('../controllers/approvalController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Get all pending purchase deletion requests
router.get('/approvals/purchases/pending', authenticate, requireAdmin(), getPendingPurchaseDeletions);

// Approve a purchase deletion request
router.post('/approvals/purchases/:purchaseId/approve', authenticate, requireAdmin(), approvePurchaseDeletion);

// Reject a purchase deletion request
router.post('/approvals/purchases/:purchaseId/reject', authenticate, requireAdmin(), rejectPurchaseDeletion);

module.exports = router;
