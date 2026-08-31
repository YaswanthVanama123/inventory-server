const express = require('express');
const router = express.Router();
const itemCaseQuantityController = require('../controllers/itemCaseQuantityController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/purchased-items', authenticate, itemCaseQuantityController.getPurchasedItems);
router.get('/mappings', authenticate, itemCaseQuantityController.getAllMappings);
router.post('/mapping', authenticate, requireAdmin(), itemCaseQuantityController.saveMapping);
router.post('/mappings/bulk', authenticate, requireAdmin(), itemCaseQuantityController.bulkSaveMappings);
router.delete('/mapping/:sku', authenticate, requireAdmin(), itemCaseQuantityController.deleteMapping);

module.exports = router;
