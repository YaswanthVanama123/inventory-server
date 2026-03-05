const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.use(authenticate);


router.get('/units', settingsController.getAllUnits);
router.post('/generate-sku', settingsController.generateSKU);
router.get('/general', settingsController.getGeneralSettings);
router.get('/stock-cutoff-date', settingsController.getStockCutoffDate);
router.get('/low-stock-threshold', settingsController.getLowStockThreshold);


router.post('/units', requireAdmin(), settingsController.addUnit);
router.put('/units/:id', requireAdmin(), settingsController.updateUnit);
router.delete('/units/:id', requireAdmin(), settingsController.deleteUnit);

router.put('/sku-config', requireAdmin(), settingsController.updateSKUConfig);
router.put('/stock-cutoff-date', requireAdmin(), settingsController.updateStockCutoffDate);
router.put('/low-stock-threshold', requireAdmin(), settingsController.updateLowStockThreshold);

module.exports = router;
