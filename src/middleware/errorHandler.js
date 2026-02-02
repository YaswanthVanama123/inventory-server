// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { statusCode: 404, message };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = { statusCode: 400, message };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { statusCode: 400, message };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { statusCode: 401, message };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { statusCode: 401, message };
  }

  // Multer errors (file upload errors)
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      error = {
        statusCode: 400,
        message: 'File size exceeds the maximum limit of 5MB',
        code: 'FILE_TOO_LARGE'
      };
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      error = {
        statusCode: 400,
        message: 'Too many files uploaded',
        code: 'TOO_MANY_FILES'
      };
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      error = {
        statusCode: 400,
        message: 'Unexpected file field',
        code: 'UNEXPECTED_FIELD'
      };
    } else {
      error = {
        statusCode: 400,
        message: err.message || 'File upload error',
        code: 'UPLOAD_ERROR'
      };
    }
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message || 'Server Error',
      code: error.code || 'SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

// Not found middleware (404)
const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      code: 'NOT_FOUND'
    }
  });
};

module.exports = {
  errorHandler,
  notFound
};
