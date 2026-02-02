const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;

    // Build query - filter out deleted users
    const query = { isDeleted: false };
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(query);

    const users = await User.find(query)
      .select('-password')
      .populate('createdBy', 'username fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    next(error);
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false })
      .select('-password')
      .populate('createdBy', 'username fullName');

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
      data: { user }
    });
  } catch (error) {
    console.error('Get user error:', error);
    next(error);
  }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res, next) => {
  try {
    const { username, email, password, fullName, role } = req.body;

    // Check if username or email already exists (not deleted)
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      isDeleted: false
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: {
          message: existingUser.username === username ? 'Username already exists' : 'Email already exists',
          code: 'DUPLICATE_USER'
        }
      });
    }

    const user = await User.create({
      username,
      email,
      password,
      fullName,
      role: role || 'employee',
      createdBy: req.user.id
    });

    // Create audit log
    await AuditLog.create({
      action: 'CREATE',
      resource: 'USER',
      resourceId: user._id,
      performedBy: req.user.id,
      details: { username, role: user.role },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role
        }
      },
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Create user error:', error);
    next(error);
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res, next) => {
  try {
    const { email, fullName, role, isActive } = req.body;

    const user = await User.findOne({ _id: req.params.id, isDeleted: false });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Update fields
    if (email) user.email = email;
    if (fullName) user.fullName = fullName;
    if (role) user.role = role;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    user.lastUpdatedBy = req.user.id;

    await user.save();

    // Create audit log
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'USER',
      resourceId: user._id,
      performedBy: req.user.id,
      details: { email, fullName, role, isActive },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive
        }
      },
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Prevent deleting yourself
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You cannot delete your own account',
          code: 'CANNOT_DELETE_SELF'
        }
      });
    }

    // Soft delete by marking as deleted
    user.isDeleted = true;
    user.deletedAt = Date.now();
    user.deletedBy = req.user.id;
    await user.save();

    // Create audit log
    await AuditLog.create({
      action: 'DELETE',
      resource: 'USER',
      resourceId: user._id,
      performedBy: req.user.id,
      details: { username: user.username },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    next(error);
  }
};

// @desc    Reset user password
// @route   POST /api/users/:id/reset-password
// @access  Private/Admin
const resetPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    const user = await User.findOne({ _id: req.params.id, isDeleted: false });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    user.password = newPassword;
    await user.save();

    // Create audit log
    await AuditLog.create({
      action: 'PASSWORD_RESET',
      resource: 'USER',
      resourceId: user._id,
      performedBy: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    next(error);
  }
};

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  resetPassword
};
