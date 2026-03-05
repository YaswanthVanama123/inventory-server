const Inventory = require('../models/Inventory');
const path = require('path');
const { deleteUploadedFile, deleteUploadedFiles, getFileUrl } = require('../middleware/upload');


class UploadExamplesService {
  async uploadItemImage(itemId, file, req) {
    const item = await Inventory.findById(itemId);
    if (!item) {
      deleteUploadedFile(file.path);
      throw new Error('Inventory item not found');
    }
    if (item.image) {
      const oldFilename = item.image.split('/').pop();
      const oldFilePath = path.join(__dirname, '../../uploads/items', oldFilename);
      deleteUploadedFile(oldFilePath);
    }
    const imageUrl = getFileUrl(req, file.filename);
    item.image = imageUrl;
    await item.save();
    return {
      item,
      imageUrl,
      filename: file.filename,
      size: file.size
    };
  }
  async uploadItemGallery(itemId, files, req) {
    const item = await Inventory.findById(itemId);
    if (!item) {
      deleteUploadedFiles(files);
      throw new Error('Inventory item not found');
    }
    const imageUrls = files.map(file => getFileUrl(req, file.filename));
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
  async deleteItemImage(itemId) {
    const item = await Inventory.findById(itemId);
    if (!item) {
      throw new Error('Inventory item not found');
    }
    if (!item.image) {
      throw new Error('No image to delete');
    }
    const filename = item.image.split('/').pop();
    const filePath = path.join(__dirname, '../../uploads/items', filename);
    deleteUploadedFile(filePath);
    item.image = null;
    await item.save();
    return { item };
  }
  async updateItemImage(itemId, file, req) {
    const item = await Inventory.findById(itemId);
    if (!item) {
      deleteUploadedFile(file.path);
      throw new Error('Inventory item not found');
    }
    if (item.image) {
      const oldFilename = item.image.split('/').pop();
      const oldFilePath = path.join(__dirname, '../../uploads/items', oldFilename);
      deleteUploadedFile(oldFilePath);
    }
    const imageUrl = getFileUrl(req, file.filename);
    item.image = imageUrl;
    await item.save();
    return {
      item,
      imageUrl,
      filename: file.filename
    };
  }
  async deleteGalleryImage(itemId, imageUrl) {
    const item = await Inventory.findById(itemId);
    if (!item) {
      throw new Error('Inventory item not found');
    }
    const imageIndex = item.gallery.indexOf(imageUrl);
    if (imageIndex === -1) {
      throw new Error('Image not found in gallery');
    }
    const filename = imageUrl.split('/').pop();
    const filePath = path.join(__dirname, '../../uploads/items', filename);
    deleteUploadedFile(filePath);
    item.gallery.splice(imageIndex, 1);
    await item.save();
    return { item };
  }
}
module.exports = new UploadExamplesService();
