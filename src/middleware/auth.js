const jwt = require('jsonwebtoken');
const User = require('../models/User');
const jwtConfig = require('../config/jwt');

// Middleware to protect routes - verifies JWT token
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Not authorized to access this route. Please login.',
          code: 'NO_TOKEN'
        }
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, jwtConfig.secret);

      // Check if user still exists
      const user = await User.findById(decoded.id).select('+password');
      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'User belonging to this token no longer exists',
            code: 'USER_NOT_FOUND'
          }
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Your account has been deactivated. Please contact admin.',
            code: 'USER_INACTIVE'
          }
        });
      }

      // Check if user changed password after token was issued
      if (user.changedPasswordAfter(decoded.iat)) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Password recently changed. Please login again.',
            code: 'PASSWORD_CHANGED'
          }
        });
      }

      // Grant access to protected route
      req.user = {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      };
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Invalid token. Please login again.',
            code: 'INVALID_TOKEN'
          }
        });
      } else if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Token expired. Please login again.',
            code: 'TOKEN_EXPIRED'
          }
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Authentication failed',
        code: 'AUTH_ERROR'
      }
    });
  }
};

// Middleware to check if user has required role(s)
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Not authenticated',
          code: 'NOT_AUTHENTICATED'
        }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Access denied. Required role: ${roles.join(' or ')}`,
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      });
    }

    next();
  };
};

// Shorthand middleware for admin only routes
const requireAdmin = () => requireRole('admin');

// Shorthand middleware for employee and admin routes
const requireEmployee = () => requireRole('employee', 'admin');

module.exports = {
  authenticate,
  requireRole,
  requireAdmin,
  requireEmployee
};
