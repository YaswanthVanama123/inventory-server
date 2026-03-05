const express = require('express');
const router = express.Router();
const stockReconciliationController = require('../controllers/stockReconciliationController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.get('/', authenticate, requireAdmin(), stockReconciliationController.getReconciliation);
module.exports = router;
