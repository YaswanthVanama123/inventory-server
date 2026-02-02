const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const jwtConfig = require('../config/jwt');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    jwtConfig.secret,
    {
      expiresIn: jwtConfig.expiresIn,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience
    }
  );
};

// @desc    Create initial admin user (one-time setup)
// @route   POST /api/auth/setup/admin
// @access  Public (but checks if admin exists)
const createInitialAdmin = async (req, res, next) => {
  try {
    // Check if any admin user already exists
    const existingAdmin = await User.findOne({ role: 'admin' });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Admin user already exists. This endpoint is for initial setup only.',
          code: 'ADMIN_EXISTS'
        }
      });
    }

    const { username, email, password, fullName } = req.body;

    // Validate required fields
    if (!username || !email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Please provide username, email, password, and fullName',
          code: 'MISSING_FIELDS'
        }
      });
    }

    // Create admin user
    const adminUser = await User.create({
      username,
      email,
      password,
      fullName,
      role: 'admin',
      isActive: true
    });

    // Create audit log
    await AuditLog.create({
      action: 'CREATE',
      resource: 'USER',
      resourceId: adminUser._id,
      performedBy: adminUser._id,
      details: {
        type: 'initial_admin_setup',
        username: adminUser.username,
        email: adminUser.email
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: adminUser._id,
          username: adminUser.username,
          email: adminUser.email,
          fullName: adminUser.fullName,
          role: adminUser.role
        }
      },
      message: 'Admin user created successfully. Please login with your credentials.'
    });
  } catch (error) {
    console.error('Create admin error:', error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        error: {
          message: `${field} already exists`,
          code: 'DUPLICATE_FIELD'
        }
      });
    }

    next(error);
  }
};

// @desc    Admin login
// @route   POST /api/auth/admin/login
// @access  Public
const adminLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Check if user exists and get password
    const user = await User.findOne({ username }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid admin credentials',
          code: 'INVALID_CREDENTIALS'
        }
      });
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. Admin privileges required.',
          code: 'NOT_ADMIN'
        }
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Your account has been deactivated. Please contact system administrator.',
          code: 'ACCOUNT_DEACTIVATED'
        }
      });
    }

    // Check if password matches
    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid admin credentials',
          code: 'INVALID_CREDENTIALS'
        }
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create audit log
    await AuditLog.create({
      action: 'LOGIN',
      resource: 'AUTH',
      performedBy: user._id,
      details: {
        userType: 'admin',
        username: user.username,
        role: user.role
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role
        }
      },
      message: 'Admin login successful'
    });
  } catch (error) {
    console.error('Admin login error:', error);
    next(error);
  }
};

// @desc    Employee/User login
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Check if user exists and get password
    const user = await User.findOne({ username }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        }
      });
    }

    // Check if user is employee (not admin)
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Please use admin login endpoint',
          code: 'USE_ADMIN_LOGIN'
        }
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Your account has been deactivated. Please contact admin.',
          code: 'ACCOUNT_DEACTIVATED'
        }
      });
    }

    // Check if password matches
    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        }
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create audit log
    await AuditLog.create({
      action: 'LOGIN',
      resource: 'AUTH',
      performedBy: user._id,
      details: {
        userType: 'employee',
        username: user.username,
        role: user.role
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role
        }
      },
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Check current password
    const isPasswordMatch = await user.comparePassword(currentPassword);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Current password is incorrect',
          code: 'INCORRECT_PASSWORD'
        }
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Create audit log
    await AuditLog.create({
      action: 'PASSWORD_CHANGE',
      resource: 'AUTH',
      resourceId: user._id,
      performedBy: user._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });
  } catch (error) {
    console.error('Change password error:', error);
    next(error);
  }
};

// @desc    Logout user (optional - mainly handled on client)
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res, next) => {
  try {
    // Create audit log
    await AuditLog.create({
      action: 'LOGOUT',
      resource: 'AUTH',
      performedBy: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    next(error);
  }
};

module.exports = {
  createInitialAdmin,
  adminLogin,
  login,
  getMe,
  changePassword,
  logout
};
