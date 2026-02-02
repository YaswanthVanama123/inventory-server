

const express = require('express');
const router = express.Router();
const {
  uploadSingleImage,
  uploadMultipleImages,
  getFileUrl,
  deleteUploadedFile,
  deleteUploadedFiles
} = require('../middleware/upload');
const { protect, authorize } = require('../middleware/auth');
const Inventory = require('../models/Inventory');
const path = require('path');






router.post('/:id/image',
  protect,                        
  uploadSingleImage('image'),     
  async (req, res, next) => {
    try {
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No file uploaded',
            code: 'NO_FILE'
          }
        });
      }

      
      const item = await Inventory.findById(req.params.id);

      if (!item) {
        
        deleteUploadedFile(req.file.path);
        return res.status(404).json({
          success: false,
          error: {
            message: 'Inventory item not found',
            code: 'NOT_FOUND'
          }
        });
      }

      
      if (item.image) {
        const oldFilename = item.image.split('/').pop();
        const oldFilePath = path.join(__dirname, '../../uploads/items', oldFilename);
        deleteUploadedFile(oldFilePath);
      }

      
      const imageUrl = getFileUrl(req, req.file.filename);

      
      item.image = imageUrl;
      await item.save();

      res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        data: {
          item,
          imageUrl,
          filename: req.file.filename,
          size: req.file.size
        }
      });

    } catch (error) {
      
      if (req.file) {
        deleteUploadedFile(req.file.path);
      }
      next(error);
    }
  }
);






router.post('/:id/gallery',
  protect,
  uploadMultipleImages('images', 5),  
  async (req, res, next) => {
    try {
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No files uploaded',
            code: 'NO_FILES'
          }
        });
      }

      
      const item = await Inventory.findById(req.params.id);

      if (!item) {
        
        deleteUploadedFiles(req.files);
        return res.status(404).json({
          success: false,
          error: {
            message: 'Inventory item not found',
            code: 'NOT_FOUND'
          }
        });
      }

      
      const imageUrls = req.files.map(file => getFileUrl(req, file.filename));

      
      if (!item.gallery) {
        item.gallery = [];
      }
      item.gallery.push(...imageUrls);
      await item.save();

      res.status(200).json({
        success: true,
        message: `${req.files.length} images uploaded successfully`,
        data: {
          item,
          uploadedCount: req.files.length,
          imageUrls,
          totalSize: req.files.reduce((sum, file) => sum + file.size, 0)
        }
      });

    } catch (error) {
      
      if (req.files) {
        deleteUploadedFiles(req.files);
      }
      next(error);
    }
  }
);






router.delete('/:id/image',
  protect,
  async (req, res, next) => {
    try {
      const item = await Inventory.findById(req.params.id);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Inventory item not found',
            code: 'NOT_FOUND'
          }
        });
      }

      if (!item.image) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No image to delete',
            code: 'NO_IMAGE'
          }
        });
      }

      
      const filename = item.image.split('/').pop();
      const filePath = path.join(__dirname, '../../uploads/items', filename);
      deleteUploadedFile(filePath);

      
      item.image = null;
      await item.save();

      res.status(200).json({
        success: true,
        message: 'Image deleted successfully',
        data: { item }
      });

    } catch (error) {
      next(error);
    }
  }
);






router.put('/:id/image',
  protect,
  uploadSingleImage('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No file uploaded',
            code: 'NO_FILE'
          }
        });
      }

      const item = await Inventory.findById(req.params.id);

      if (!item) {
        deleteUploadedFile(req.file.path);
        return res.status(404).json({
          success: false,
          error: {
            message: 'Inventory item not found',
            code: 'NOT_FOUND'
          }
        });
      }

      
      if (item.image) {
        const oldFilename = item.image.split('/').pop();
        const oldFilePath = path.join(__dirname, '../../uploads/items', oldFilename);
        deleteUploadedFile(oldFilePath);
      }

      
      const imageUrl = getFileUrl(req, req.file.filename);
      item.image = imageUrl;
      await item.save();

      res.status(200).json({
        success: true,
        message: 'Image updated successfully',
        data: {
          item,
          imageUrl,
          filename: req.file.filename
        }
      });

    } catch (error) {
      if (req.file) {
        deleteUploadedFile(req.file.path);
      }
      next(error);
    }
  }
);






router.delete('/:id/gallery',
  protect,
  async (req, res, next) => {
    try {
      const { imageUrl } = req.body;

      if (!imageUrl) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Image URL is required',
            code: 'MISSING_URL'
          }
        });
      }

      const item = await Inventory.findById(req.params.id);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Inventory item not found',
            code: 'NOT_FOUND'
          }
        });
      }

      
      const imageIndex = item.gallery.indexOf(imageUrl);
      if (imageIndex === -1) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Image not found in gallery',
            code: 'IMAGE_NOT_FOUND'
          }
        });
      }

      
      const filename = imageUrl.split('/').pop();
      const filePath = path.join(__dirname, '../../uploads/items', filename);
      deleteUploadedFile(filePath);

      
      item.gallery.splice(imageIndex, 1);
      await item.save();

      res.status(200).json({
        success: true,
        message: 'Image removed from gallery',
        data: { item }
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;


