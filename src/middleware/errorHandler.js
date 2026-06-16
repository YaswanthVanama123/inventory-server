const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  if (err.name === 'CastError') {
    error = { statusCode: 404, message: 'Resource not found' };
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = { statusCode: 400, message: `${field} already exists` };
  }
  if (err.name === 'ValidationError') {
    error = {
      statusCode: 400,
      message: Object.values(err.errors).map((v) => v.message).join(', '),
    };
  }
  if (err.name === 'JsonWebTokenError') {
    error = { statusCode: 401, message: 'Invalid token' };
  }
  if (err.name === 'TokenExpiredError') {
    error = { statusCode: 401, message: 'Token expired' };
  }
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      error = { statusCode: 400, message: 'File size exceeds the maximum limit of 5MB', code: 'FILE_TOO_LARGE' };
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      error = { statusCode: 400, message: 'Too many files uploaded', code: 'TOO_MANY_FILES' };
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      error = { statusCode: 400, message: 'Unexpected file field', code: 'UNEXPECTED_FIELD' };
    } else {
      error = { statusCode: 400, message: err.message || 'File upload error', code: 'UPLOAD_ERROR' };
    }
  }

  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(`Error ${statusCode} ${req.method} ${req.originalUrl}:`, err.message);
    if (err.stack) console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message: error.message || 'Server Error',
      code: error.code || 'SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      code: 'NOT_FOUND',
    },
  });
};

module.exports = { errorHandler, notFound };
