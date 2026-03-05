const uploadExamplesService = require('../services/uploadExamples.service');


class UploadExamplesController {
  async uploadItemImage(req, res, next) {
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
      const data = await uploadExamplesService.uploadItemImage(
        req.params.id,
        req.file,
        req
      );
      res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        data
      });
    } catch (error) {
      if (req.file) {
        const { deleteUploadedFile } = require('../middleware/upload');
        deleteUploadedFile(req.file.path);
      }
      if (error.message === 'Inventory item not found') {
        return res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'NOT_FOUND'
          }
        });
      }
      next(error);
    }
  }
  async uploadItemGallery(req, res, next) {
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
      const data = await uploadExamplesService.uploadItemGallery(
        req.params.id,
        req.files,
        req
      );
      res.status(200).json({
        success: true,
        message: `${req.files.length} images uploaded successfully`,
        data
      });
    } catch (error) {
      if (req.files) {
        const { deleteUploadedFiles } = require('../middleware/upload');
        deleteUploadedFiles(req.files);
      }
      if (error.message === 'Inventory item not found') {
        return res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'NOT_FOUND'
          }
        });
      }
      next(error);
    }
  }
  async deleteItemImage(req, res, next) {
    try {
      const data = await uploadExamplesService.deleteItemImage(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Image deleted successfully',
        data
      });
    } catch (error) {
      if (error.message === 'Inventory item not found') {
        return res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'NOT_FOUND'
          }
        });
      }
      if (error.message === 'No image to delete') {
        return res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'NO_IMAGE'
          }
        });
      }
      next(error);
    }
  }
  async updateItemImage(req, res, next) {
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
      const data = await uploadExamplesService.updateItemImage(
        req.params.id,
        req.file,
        req
      );
      res.status(200).json({
        success: true,
        message: 'Image updated successfully',
        data
      });
    } catch (error) {
      if (req.file) {
        const { deleteUploadedFile } = require('../middleware/upload');
        deleteUploadedFile(req.file.path);
      }
      if (error.message === 'Inventory item not found') {
        return res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'NOT_FOUND'
          }
        });
      }
      next(error);
    }
  }
  async deleteGalleryImage(req, res, next) {
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
      const data = await uploadExamplesService.deleteGalleryImage(
        req.params.id,
        imageUrl
      );
      res.status(200).json({
        success: true,
        message: 'Image removed from gallery',
        data
      });
    } catch (error) {
      if (error.message === 'Inventory item not found') {
        return res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'NOT_FOUND'
          }
        });
      }
      if (error.message === 'Image not found in gallery') {
        return res.status(404).json({
          success: false,
          error: {
            message: error.message,
            code: 'IMAGE_NOT_FOUND'
          }
        });
      }
      next(error);
    }
  }
}
module.exports = new UploadExamplesController();
