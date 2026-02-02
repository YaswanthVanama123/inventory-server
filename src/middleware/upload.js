const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/items');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-randomstring-originalname
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    // Sanitize filename: remove special characters and spaces
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${sanitizedName}-${uniqueSuffix}${ext}`);
  }
});

// File filter function to validate file types
const fileFilter = (req, file, cb) => {
  // Allowed file extensions
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  // Allowed MIME types
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(mimeType)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${allowedExtensions.join(', ')} files are allowed.`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 10 // Maximum 10 files at once for multiple upload
  }
});

// Middleware for single image upload
const uploadSingleImage = (fieldName = 'image') => {
  return (req, res, next) => {
    const singleUpload = upload.single(fieldName);

    singleUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              message: 'File size exceeds the maximum limit of 5MB',
              code: 'FILE_TOO_LARGE'
            }
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            error: {
              message: `Unexpected field. Expected field name: ${fieldName}`,
              code: 'UNEXPECTED_FIELD'
            }
          });
        }
        return res.status(400).json({
          success: false,
          error: {
            message: err.message,
            code: 'UPLOAD_ERROR'
          }
        });
      } else if (err) {
        // Custom errors (e.g., file filter errors)
        return res.status(400).json({
          success: false,
          error: {
            message: err.message,
            code: 'INVALID_FILE'
          }
        });
      }

      // No errors, proceed to next middleware
      next();
    });
  };
};

// Middleware for multiple images upload (optional - no error if no files)
const uploadMultipleImagesOptional = (fieldName = 'images', maxCount = 10) => {
  return (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);

    multipleUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              message: 'One or more files exceed the maximum size limit of 5MB',
              code: 'FILE_TOO_LARGE'
            }
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            error: {
              message: `Too many files. Maximum ${maxCount} files allowed`,
              code: 'TOO_MANY_FILES'
            }
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            error: {
              message: `Unexpected field. Expected field name: ${fieldName}`,
              code: 'UNEXPECTED_FIELD'
            }
          });
        }
        return res.status(400).json({
          success: false,
          error: {
            message: err.message,
            code: 'UPLOAD_ERROR'
          }
        });
      } else if (err) {
        // Custom errors (e.g., file filter errors)
        return res.status(400).json({
          success: false,
          error: {
            message: err.message,
            code: 'INVALID_FILE'
          }
        });
      }

      // No errors, proceed to next middleware (even if no files uploaded)
      next();
    });
  };
};

// Middleware for multiple images upload
const uploadMultipleImages = (fieldName = 'images', maxCount = 10) => {
  return (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);

    multipleUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              message: 'One or more files exceed the maximum size limit of 5MB',
              code: 'FILE_TOO_LARGE'
            }
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            error: {
              message: `Too many files. Maximum ${maxCount} files allowed`,
              code: 'TOO_MANY_FILES'
            }
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            error: {
              message: `Unexpected field. Expected field name: ${fieldName}`,
              code: 'UNEXPECTED_FIELD'
            }
          });
        }
        return res.status(400).json({
          success: false,
          error: {
            message: err.message,
            code: 'UPLOAD_ERROR'
          }
        });
      } else if (err) {
        // Custom errors (e.g., file filter errors)
        return res.status(400).json({
          success: false,
          error: {
            message: err.message,
            code: 'INVALID_FILE'
          }
        });
      }

      // Validate that at least one file was uploaded if required
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No files uploaded',
            code: 'NO_FILES'
          }
        });
      }

      // No errors, proceed to next middleware
      next();
    });
  };
};

// Helper function to delete uploaded file(s) - useful for cleanup on error
const deleteUploadedFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted file: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error.message);
  }
};

// Helper function to delete multiple files
const deleteUploadedFiles = (files) => {
  if (Array.isArray(files)) {
    files.forEach(file => {
      if (file.path) {
        deleteUploadedFile(file.path);
      }
    });
  }
};

// Helper function to get file URL
const getFileUrl = (req, filename) => {
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/uploads/items/${filename}`;
};

module.exports = {
  upload,
  uploadSingleImage,
  uploadMultipleImages,
  uploadMultipleImagesOptional,
  deleteUploadedFile,
  deleteUploadedFiles,
  getFileUrl
};
