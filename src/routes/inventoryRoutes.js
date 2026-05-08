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
  getInventoryItemsForTruckCheckout,
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
const { setActivityMeta } = require('../middleware/activityLogger');


router.use(authenticate);
router.get('/pos', requireEmployee(), setActivityMeta('VIEW', 'INVENTORY_POS'), getInventoryItemsForPOS);
router.get('/truck-checkout', requireEmployee(), setActivityMeta('VIEW', 'INVENTORY_TRUCK_CHECKOUT'), getInventoryItemsForTruckCheckout);
router.get('/', requireEmployee(), setActivityMeta('VIEW', 'INVENTORY'), getInventoryItems);
router.get('/low-stock', requireEmployee(), setActivityMeta('VIEW', 'INVENTORY_LOW_STOCK'), getLowStockItems);
router.get('/sync-source', requireEmployee(), setActivityMeta('VIEW', 'INVENTORY_SYNC_SOURCE'), getItemsBySyncSource);
router.get('/stock-movements', requireEmployee(), setActivityMeta('VIEW', 'STOCK_MOVEMENTS'), getStockMovements);
router.get('/sync-health', requireEmployee(), setActivityMeta('VIEW', 'SYNC_HEALTH'), getSyncHealth);
router.get('/sync-status', requireEmployee(), setActivityMeta('VIEW', 'INVENTORY_SYNC_STATUS'), getInventorySyncStatus);
router.get('/:id', requireEmployee(), setActivityMeta('VIEW', 'INVENTORY'), getInventoryItem);
router.get('/:id/history', requireEmployee(), setActivityMeta('VIEW', 'STOCK_HISTORY'), getStockHistory);
router.get('/:id/sync-info', requireEmployee(), setActivityMeta('VIEW', 'SYNC_INFO'), getSyncInfo);
router.patch('/:id/stock', requireEmployee(), setActivityMeta('UPDATE', 'INVENTORY_STOCK'), inventoryValidation.updateStock, validate, updateStock);
router.post('/', requireAdmin(), uploadMultipleImagesOptional('images', 10), parseFormDataJSON, inventoryValidation.create, validate, setActivityMeta('CREATE', 'INVENTORY'), createInventoryItem);
router.put('/:id', requireAdmin(), uploadMultipleImagesOptional('images', 10), parseFormDataJSON, inventoryValidation.update, validate, setActivityMeta('UPDATE', 'INVENTORY'), updateInventoryItem);
router.delete('/:id', requireAdmin(), setActivityMeta('DELETE', 'INVENTORY'), deleteInventoryItem);
router.post('/:id/images', requireAdmin(), uploadMultipleImages('images', 10), setActivityMeta('UPLOAD', 'INVENTORY_IMAGE'), uploadImages);
router.delete('/:id/images/:imageId', requireAdmin(), setActivityMeta('DELETE', 'INVENTORY_IMAGE'), deleteImage);
router.patch('/:id/images/primary', requireAdmin(), setActivityMeta('UPDATE', 'INVENTORY_PRIMARY_IMAGE'), setPrimaryImage);
module.exports = router;
