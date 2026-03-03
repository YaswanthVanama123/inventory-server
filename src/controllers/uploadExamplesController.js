const uploadExamplesService = require('../services/uploadExamples.service');

/**
 * Upload Examples Controller
 * Handles HTTP requests for file upload operations
 */
class UploadExamplesController {
  /**
   * Upload single image to inventory item
   * POST /api/upload-examples/:id/image
   */
  async uploadItemImage(req, res, next) {
    try {
      // Validate file upload
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
      // Clean up file on error
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

  /**
   * Upload multiple images to inventory item gallery
   * POST /api/upload-examples/:id/gallery
   */
  async uploadItemGallery(req, res, next) {
    try {
      // Validate file upload
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
      // Clean up files on error
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

  /**
   * Delete item image
   * DELETE /api/upload-examples/:id/image
   */
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

  /**
   * Update item image
   * PUT /api/upload-examples/:id/image
   */
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

  /**
   * Delete image from gallery
   * DELETE /api/upload-examples/:id/gallery
   */
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
