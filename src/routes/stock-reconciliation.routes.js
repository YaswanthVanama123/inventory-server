const express = require('express');
const router = express.Router();
const stockReconciliationController = require('../controllers/stockReconciliationController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * Stock Reconciliation Routes
 * Clean routes with no business logic - delegates to controller
 */

// Get stock reconciliation report
router.get('/', authenticate, requireAdmin(), stockReconciliationController.getReconciliation);

module.exports = router;
