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
  getCategories,
  uploadImages,
  deleteImage,
  setPrimaryImage
} = require('../controllers/inventoryController');
const { authenticate, requireAdmin, requireEmployee } = require('../middleware/auth');
const { inventoryValidation, validate, parseFormDataJSON } = require('../middleware/validation');
const { uploadMultipleImagesOptional, uploadMultipleImages } = require('../middleware/upload');

// All routes require authentication
router.use(authenticate);

// Routes accessible by both employees and admins
router.get('/', requireEmployee(), getInventoryItems);
router.get('/low-stock', requireEmployee(), getLowStockItems);
router.get('/categories', requireEmployee(), getCategories);
router.get('/:id', requireEmployee(), getInventoryItem);
router.get('/:id/history', requireEmployee(), getStockHistory);
router.patch('/:id/stock', requireEmployee(), inventoryValidation.updateStock, validate, updateStock);

// Admin only routes
router.post('/', requireAdmin(), uploadMultipleImagesOptional('images', 10), parseFormDataJSON, inventoryValidation.create, validate, createInventoryItem);
router.put('/:id', requireAdmin(), uploadMultipleImagesOptional('images', 10), parseFormDataJSON, inventoryValidation.update, validate, updateInventoryItem);
router.delete('/:id', requireAdmin(), deleteInventoryItem);

// Image management routes (Admin only)
router.post('/:id/images', requireAdmin(), uploadMultipleImages('images', 10), uploadImages);
router.delete('/:id/images/:imageId', requireAdmin(), deleteImage);
router.patch('/:id/images/primary', requireAdmin(), setPrimaryImage);

module.exports = router;
