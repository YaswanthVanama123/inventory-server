const express = require('express');
const router = express.Router();
const {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateStock,
  getStockHistory,
  getLowStockItems,
  getInventoryItemsForPOS,
  getCategories,
  uploadImages,
  deleteImage,
  setPrimaryImage,
  getItemsBySyncSource,
  getStockMovements,
  getSyncHealth,
  getSyncInfo,
  getInventorySyncStatus
} = require('../controllers/inventoryController');
const { authenticate, requireAdmin, requireEmployee } = require('../middleware/auth');
const { inventoryValidation, validate, parseFormDataJSON } = require('../middleware/validation');
const { uploadMultipleImagesOptional, uploadMultipleImages } = require('../middleware/upload');


router.use(authenticate);


router.get('/pos', requireEmployee(), getInventoryItemsForPOS);


router.get('/', requireEmployee(), getInventoryItems);
router.get('/low-stock', requireEmployee(), getLowStockItems);
router.get('/categories', requireEmployee(), getCategories);
router.get('/sync-source', requireEmployee(), getItemsBySyncSource);
router.get('/stock-movements', requireEmployee(), getStockMovements);
router.get('/sync-health', requireEmployee(), getSyncHealth);
router.get('/sync-status', requireEmployee(), getInventorySyncStatus);
router.get('/:id', requireEmployee(), getInventoryItem);
router.get('/:id/history', requireEmployee(), getStockHistory);
router.get('/:id/sync-info', requireEmployee(), getSyncInfo);
router.patch('/:id/stock', requireEmployee(), inventoryValidation.updateStock, validate, updateStock);


router.post('/', requireAdmin(), uploadMultipleImagesOptional('images', 10), parseFormDataJSON, inventoryValidation.create, validate, createInventoryItem);
router.put('/:id', requireAdmin(), uploadMultipleImagesOptional('images', 10), parseFormDataJSON, inventoryValidation.update, validate, updateInventoryItem);
router.delete('/:id', requireAdmin(), deleteInventoryItem);


router.post('/:id/images', requireAdmin(), uploadMultipleImages('images', 10), uploadImages);
router.delete('/:id/images/:imageId', requireAdmin(), deleteImage);
router.patch('/:id/images/primary', requireAdmin(), setPrimaryImage);

module.exports = router;
