const multer = require('multer');
const path = require('path');
const fs = require('fs');


const uploadsDir = path.join(__dirname, '../../uploads/items');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${sanitizedName}-${uniqueSuffix}${ext}`);
  }
});


const fileFilter = (req, file, cb) => {
  
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(mimeType)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${allowedExtensions.join(', ')} files are allowed.`), false);
  }
};


const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, 
    files: 10 
  }
});


const uploadSingleImage = (fieldName = 'image') => {
  return (req, res, next) => {
    const singleUpload = upload.single(fieldName);

    singleUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        
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
        
        return res.status(400).json({
          success: false,
          error: {
            message: err.message,
            code: 'INVALID_FILE'
          }
        });
      }

      
      next();
    });
  };
};


const uploadMultipleImagesOptional = (fieldName = 'images', maxCount = 10) => {
  return (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);

    multipleUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        
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
        
        return res.status(400).json({
          success: false,
          error: {
            message: err.message,
            code: 'INVALID_FILE'
          }
        });
      }

      
      next();
    });
  };
};


const uploadMultipleImages = (fieldName = 'images', maxCount = 10) => {
  return (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);

    multipleUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        
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
        
        return res.status(400).json({
          success: false,
          error: {
            message: err.message,
            code: 'INVALID_FILE'
          }
        });
      }

      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No files uploaded',
            code: 'NO_FILES'
          }
        });
      }

      
      next();
    });
  };
};


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


const deleteUploadedFiles = (files) => {
  if (Array.isArray(files)) {
    files.forEach(file => {
      if (file.path) {
        deleteUploadedFile(file.path);
      }
    });
  }
};


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
