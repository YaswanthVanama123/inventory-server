const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const stockController = require('../controllers/stockController');

/**
 * Stock Routes
 * Clean routes with no business logic - delegates to controller
 */

// Get SKUs for a category (purchases only)
router.get('/category/:categoryName/skus', authenticate, stockController.getCategorySkus);

// Get complete sales data for a category (purchases + sales + checkouts + discrepancies)
router.get('/category/:categoryName/sales', authenticate, stockController.getCategorySales);

// Get forUse stock summary
router.get('/use', authenticate, stockController.getUseStock);

// Get forSell stock summary
router.get('/sell', authenticate, stockController.getSellStock);

// Get complete stock summary (optimized - use + sell)
router.get('/summary', authenticate, stockController.getStockSummary);

module.exports = router;
