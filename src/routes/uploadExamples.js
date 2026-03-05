const express = require('express');
const router = express.Router();
const uploadExamplesController = require('../controllers/uploadExamplesController');
const {
  uploadSingleImage,
  uploadMultipleImages
} = require('../middleware/upload');
const { protect } = require('../middleware/auth');


router.post('/:id/image',
  protect,
  uploadSingleImage('image'),
  uploadExamplesController.uploadItemImage
);
router.post('/:id/gallery',
  protect,
  uploadMultipleImages('images', 5),
  uploadExamplesController.uploadItemGallery
);
router.delete('/:id/image',
  protect,
  uploadExamplesController.deleteItemImage
);
router.put('/:id/image',
  protect,
  uploadSingleImage('image'),
  uploadExamplesController.updateItemImage
);
router.delete('/:id/gallery',
  protect,
  uploadExamplesController.deleteGalleryImage
);
module.exports = router;
