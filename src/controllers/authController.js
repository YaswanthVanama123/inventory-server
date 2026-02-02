const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const jwtConfig = require('../config/jwt');


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




const createInitialAdmin = async (req, res, next) => {
  try {
    
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

    
    if (!username || !email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Please provide username, email, password, and fullName',
          code: 'MISSING_FIELDS'
        }
      });
    }

    
    const adminUser = await User.create({
      username,
      email,
      password,
      fullName,
      role: 'admin',
      isActive: true
    });

    
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




const adminLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    
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

    
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. Admin privileges required.',
          code: 'NOT_ADMIN'
        }
      });
    }

    
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Your account has been deactivated. Please contact system administrator.',
          code: 'ACCOUNT_DEACTIVATED'
        }
      });
    }

    
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

    
    user.lastLogin = new Date();
    await user.save();

    
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




const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    
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

    
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Please use admin login endpoint',
          code: 'USE_ADMIN_LOGIN'
        }
      });
    }

    
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Your account has been deactivated. Please contact admin.',
          code: 'ACCOUNT_DEACTIVATED'
        }
      });
    }

    
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

    
    user.lastLogin = new Date();
    await user.save();

    
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




const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    
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

    
    user.password = newPassword;
    await user.save();

    
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




const logout = async (req, res, next) => {
  try {
    
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
