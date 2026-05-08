const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { setActivityMeta } = require('../middleware/activityLogger');


router.use(authenticate);
router.get('/units', setActivityMeta('VIEW', 'SETTINGS_UNITS'), settingsController.getAllUnits);
router.post('/generate-sku', setActivityMeta('GENERATE', 'SKU'), settingsController.generateSKU);
router.get('/general', setActivityMeta('VIEW', 'SETTINGS_GENERAL'), settingsController.getGeneralSettings);
router.get('/stock-cutoff-date', setActivityMeta('VIEW', 'SETTINGS_STOCK_CUTOFF'), settingsController.getStockCutoffDate);
router.get('/low-stock-threshold', setActivityMeta('VIEW', 'SETTINGS_LOW_STOCK'), settingsController.getLowStockThreshold);
router.post('/units', requireAdmin(), setActivityMeta('CREATE', 'SETTINGS_UNIT'), settingsController.addUnit);
router.put('/units/:id', requireAdmin(), setActivityMeta('UPDATE', 'SETTINGS_UNIT'), settingsController.updateUnit);
router.delete('/units/:id', requireAdmin(), setActivityMeta('DELETE', 'SETTINGS_UNIT'), settingsController.deleteUnit);
router.put('/sku-config', requireAdmin(), setActivityMeta('UPDATE', 'SETTINGS_SKU_CONFIG'), settingsController.updateSKUConfig);
router.put('/stock-cutoff-date', requireAdmin(), setActivityMeta('UPDATE', 'SETTINGS_STOCK_CUTOFF'), settingsController.updateStockCutoffDate);
router.put('/low-stock-threshold', requireAdmin(), setActivityMeta('UPDATE', 'SETTINGS_LOW_STOCK'), settingsController.updateLowStockThreshold);
module.exports = router;
