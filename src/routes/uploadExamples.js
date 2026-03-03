const express = require('express');
const router = express.Router();
const uploadExamplesController = require('../controllers/uploadExamplesController');
const {
  uploadSingleImage,
  uploadMultipleImages
} = require('../middleware/upload');
const { protect } = require('../middleware/auth');

/**
 * Upload Examples Routes
 * Clean routes with no business logic - delegates to controller
 */

// Upload single image to inventory item
router.post('/:id/image',
  protect,
  uploadSingleImage('image'),
  uploadExamplesController.uploadItemImage
);

// Upload multiple images to inventory item gallery
router.post('/:id/gallery',
  protect,
  uploadMultipleImages('images', 5),
  uploadExamplesController.uploadItemGallery
);

// Delete item image
router.delete('/:id/image',
  protect,
  uploadExamplesController.deleteItemImage
);

// Update item image
router.put('/:id/image',
  protect,
  uploadSingleImage('image'),
  uploadExamplesController.updateItemImage
);

// Delete image from gallery
router.delete('/:id/gallery',
  protect,
  uploadExamplesController.deleteGalleryImage
);

module.exports = router;
