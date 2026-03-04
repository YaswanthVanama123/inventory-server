const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const stockController = require('../controllers/stockController');




router.get('/category/:categoryName/skus', authenticate, stockController.getCategorySkus);


router.get('/category/:categoryName/sales', authenticate, stockController.getCategorySales);


router.get('/use', authenticate, stockController.getUseStock);


router.get('/sell', authenticate, stockController.getSellStock);


router.get('/summary', authenticate, stockController.getStockSummary);

module.exports = router;
