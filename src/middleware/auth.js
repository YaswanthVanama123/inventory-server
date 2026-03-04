const jwt = require('jsonwebtoken');
const User = require('../models/User');
const jwtConfig = require('../config/jwt');

// Simple in-memory user cache (10 second TTL)
const userCache = new Map();
const userCacheTTL = new Map();

function getCachedUser(userId) {
  const ttl = userCacheTTL.get(userId);
  if (ttl && Date.now() < ttl) {
    return userCache.get(userId);
  }
  // Expired or missing
  userCache.delete(userId);
  userCacheTTL.delete(userId);
  return null;
}

function setCachedUser(userId, user) {
  userCache.set(userId, user);
  userCacheTTL.set(userId, Date.now() + 10000); // 10 seconds
}

const authenticate = async (req, res, next) => {
  const authStartTime = Date.now();

  try {

    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }


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
      const jwtStartTime = Date.now();

      const decoded = jwt.verify(token, jwtConfig.secret);
      const jwtTime = Date.now() - jwtStartTime;

      const dbStartTime = Date.now();

      // Try cache first
      let user = getCachedUser(decoded.id);
      let cacheHit = !!user;

      if (!user) {
        user = await User.findById(decoded.id)
          .select('name email role isActive passwordChangedAt')
          .lean(); // Use lean() for faster queries
        if (user) {
          setCachedUser(decoded.id, user);
        }
      }

      const dbTime = Date.now() - dbStartTime;

      console.log(`[TIMING] Auth - JWT verify: ${jwtTime}ms, DB lookup: ${dbTime}ms (cache ${cacheHit ? 'HIT' : 'MISS'})`);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'User belonging to this token no longer exists',
            code: 'USER_NOT_FOUND'
          }
        });
      }


      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Your account has been deactivated. Please contact admin.',
            code: 'USER_INACTIVE'
          }
        });
      }


      // Check password change with lean object
      if (user.passwordChangedAt) {
        const passwordChangedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
        if (passwordChangedTimestamp > decoded.iat) {
          return res.status(401).json({
            success: false,
            error: {
              message: 'Password recently changed. Please login again.',
              code: 'PASSWORD_CHANGED'
            }
          });
        }
      }

      
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


const requireAdmin = () => requireRole('admin');


const requireEmployee = () => requireRole('employee', 'admin');

module.exports = {
  authenticate,
  requireRole,
  requireAdmin,
  requireEmployee
};
