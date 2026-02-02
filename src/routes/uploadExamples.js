/**
 * Example Route Implementation for Image Upload
 *
 * This file demonstrates how to integrate the upload middleware
 * into your inventory routes.
 *
 * To use this, add these routes to your existing inventoryRoutes.js
 */

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

// ============================================
// SINGLE IMAGE UPLOAD EXAMPLE
// ============================================

/**
 * @route   POST /api/inventory/:id/image
 * @desc    Upload single image for inventory item
 * @access  Private
 */
router.post('/:id/image',
  protect,                        // Require authentication
  uploadSingleImage('image'),     // Handle file upload (field name: 'image')
  async (req, res, next) => {
    try {
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No file uploaded',
            code: 'NO_FILE'
          }
        });
      }

      // Find inventory item
      const item = await Inventory.findById(req.params.id);

      if (!item) {
        // Cleanup uploaded file if item not found
        deleteUploadedFile(req.file.path);
        return res.status(404).json({
          success: false,
          error: {
            message: 'Inventory item not found',
            code: 'NOT_FOUND'
          }
        });
      }

      // Delete old image if exists
      if (item.image) {
        const oldFilename = item.image.split('/').pop();
        const oldFilePath = path.join(__dirname, '../../uploads/items', oldFilename);
        deleteUploadedFile(oldFilePath);
      }

      // Generate public URL for the uploaded image
      const imageUrl = getFileUrl(req, req.file.filename);

      // Update item with new image
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
      // Cleanup on error
      if (req.file) {
        deleteUploadedFile(req.file.path);
      }
      next(error);
    }
  }
);

// ============================================
// MULTIPLE IMAGES UPLOAD EXAMPLE
// ============================================

/**
 * @route   POST /api/inventory/:id/gallery
 * @desc    Upload multiple images for inventory item gallery
 * @access  Private
 */
router.post('/:id/gallery',
  protect,
  uploadMultipleImages('images', 5),  // Max 5 images, field name: 'images'
  async (req, res, next) => {
    try {
      // Check if files were uploaded
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No files uploaded',
            code: 'NO_FILES'
          }
        });
      }

      // Find inventory item
      const item = await Inventory.findById(req.params.id);

      if (!item) {
        // Cleanup uploaded files if item not found
        deleteUploadedFiles(req.files);
        return res.status(404).json({
          success: false,
          error: {
            message: 'Inventory item not found',
            code: 'NOT_FOUND'
          }
        });
      }

      // Generate URLs for all uploaded images
      const imageUrls = req.files.map(file => getFileUrl(req, file.filename));

      // Add to item's gallery array
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
      // Cleanup on error
      if (req.files) {
        deleteUploadedFiles(req.files);
      }
      next(error);
    }
  }
);

// ============================================
// DELETE IMAGE EXAMPLE
// ============================================

/**
 * @route   DELETE /api/inventory/:id/image
 * @desc    Delete image from inventory item
 * @access  Private
 */
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

      // Extract filename and delete file
      const filename = item.image.split('/').pop();
      const filePath = path.join(__dirname, '../../uploads/items', filename);
      deleteUploadedFile(filePath);

      // Remove from database
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

// ============================================
// UPDATE IMAGE EXAMPLE
// ============================================

/**
 * @route   PUT /api/inventory/:id/image
 * @desc    Update/replace image for inventory item
 * @access  Private
 */
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

      // Delete old image
      if (item.image) {
        const oldFilename = item.image.split('/').pop();
        const oldFilePath = path.join(__dirname, '../../uploads/items', oldFilename);
        deleteUploadedFile(oldFilePath);
      }

      // Update with new image
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

// ============================================
// DELETE SINGLE IMAGE FROM GALLERY
// ============================================

/**
 * @route   DELETE /api/inventory/:id/gallery/:imageUrl
 * @desc    Delete specific image from gallery
 * @access  Private
 */
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

      // Check if image exists in gallery
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

      // Delete file
      const filename = imageUrl.split('/').pop();
      const filePath = path.join(__dirname, '../../uploads/items', filename);
      deleteUploadedFile(filePath);

      // Remove from gallery array
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

/**
 * INTEGRATION INSTRUCTIONS:
 *
 * 1. Open your existing server/src/routes/inventoryRoutes.js
 *
 * 2. Add these imports at the top:
 *    const {
 *      uploadSingleImage,
 *      uploadMultipleImages,
 *      getFileUrl,
 *      deleteUploadedFile,
 *      deleteUploadedFiles
 *    } = require('../middleware/upload');
 *    const path = require('path');
 *
 * 3. Copy the route handlers you need from this file
 *
 * 4. Make sure your Inventory model has these fields:
 *    - image: String (for single image URL)
 *    - gallery: [String] (for multiple image URLs)
 *
 * 5. Test the endpoints using Postman or the frontend examples
 *    in UPLOAD_USAGE.md
 */
