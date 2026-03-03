const Inventory = require('../models/Inventory');
const path = require('path');
const { deleteUploadedFile, deleteUploadedFiles, getFileUrl } = require('../middleware/upload');

/**
 * Upload Examples Service
 * Handles all business logic for file upload operations
 */
class UploadExamplesService {
  /**
   * Upload single image to inventory item
   */
  async uploadItemImage(itemId, file, req) {
    const item = await Inventory.findById(itemId);

    if (!item) {
      // Clean up uploaded file
      deleteUploadedFile(file.path);
      throw new Error('Inventory item not found');
    }

    // Delete old image if exists
    if (item.image) {
      const oldFilename = item.image.split('/').pop();
      const oldFilePath = path.join(__dirname, '../../uploads/items', oldFilename);
      deleteUploadedFile(oldFilePath);
    }

    // Generate URL for new image
    const imageUrl = getFileUrl(req, file.filename);

    // Update item with new image
    item.image = imageUrl;
    await item.save();

    return {
      item,
      imageUrl,
      filename: file.filename,
      size: file.size
    };
  }

  /**
   * Upload multiple images to inventory item gallery
   */
  async uploadItemGallery(itemId, files, req) {
    const item = await Inventory.findById(itemId);

    if (!item) {
      // Clean up uploaded files
      deleteUploadedFiles(files);
      throw new Error('Inventory item not found');
    }

    // Generate URLs for uploaded images
    const imageUrls = files.map(file => getFileUrl(req, file.filename));

    // Add to gallery
    if (!item.gallery) {
      item.gallery = [];
    }
    item.gallery.push(...imageUrls);
    await item.save();

    return {
      item,
      uploadedCount: files.length,
      imageUrls,
      totalSize: files.reduce((sum, file) => sum + file.size, 0)
    };
  }

  /**
   * Delete item image
   */
  async deleteItemImage(itemId) {
    const item = await Inventory.findById(itemId);

    if (!item) {
      throw new Error('Inventory item not found');
    }

    if (!item.image) {
      throw new Error('No image to delete');
    }

    // Delete file from filesystem
    const filename = item.image.split('/').pop();
    const filePath = path.join(__dirname, '../../uploads/items', filename);
    deleteUploadedFile(filePath);

    // Remove from database
    item.image = null;
    await item.save();

    return { item };
  }

  /**
   * Update item image
   */
  async updateItemImage(itemId, file, req) {
    const item = await Inventory.findById(itemId);

    if (!item) {
      deleteUploadedFile(file.path);
      throw new Error('Inventory item not found');
    }

    // Delete old image if exists
    if (item.image) {
      const oldFilename = item.image.split('/').pop();
      const oldFilePath = path.join(__dirname, '../../uploads/items', oldFilename);
      deleteUploadedFile(oldFilePath);
    }

    // Generate URL for new image
    const imageUrl = getFileUrl(req, file.filename);
    item.image = imageUrl;
    await item.save();

    return {
      item,
      imageUrl,
      filename: file.filename
    };
  }

  /**
   * Delete image from gallery
   */
  async deleteGalleryImage(itemId, imageUrl) {
    const item = await Inventory.findById(itemId);

    if (!item) {
      throw new Error('Inventory item not found');
    }

    // Find image in gallery
    const imageIndex = item.gallery.indexOf(imageUrl);
    if (imageIndex === -1) {
      throw new Error('Image not found in gallery');
    }

    // Delete file from filesystem
    const filename = imageUrl.split('/').pop();
    const filePath = path.join(__dirname, '../../uploads/items', filename);
    deleteUploadedFile(filePath);

    // Remove from gallery
    item.gallery.splice(imageIndex, 1);
    await item.save();

    return { item };
  }
}

module.exports = new UploadExamplesService();
