const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Public routes (for all authenticated users)
router.get('/', settingsController.getSettings);
router.get('/categories', settingsController.getAllCategories);
router.get('/units', settingsController.getAllUnits);
router.post('/generate-sku', settingsController.generateSKU);

// Admin-only routes
router.post('/categories', requireAdmin(), settingsController.addCategory);
router.put('/categories/:id', requireAdmin(), settingsController.updateCategory);
router.delete('/categories/:id', requireAdmin(), settingsController.deleteCategory);

router.post('/units', requireAdmin(), settingsController.addUnit);
router.put('/units/:id', requireAdmin(), settingsController.updateUnit);
router.delete('/units/:id', requireAdmin(), settingsController.deleteUnit);

router.put('/sku-config', requireAdmin(), settingsController.updateSKUConfig);

module.exports = router;
