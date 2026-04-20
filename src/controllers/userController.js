const User = require('../models/User');
const AuditLog = require('../models/AuditLog');


const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
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
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .populate('createdBy', 'username fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);
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
const getUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false })
      .select('-password')
      .populate('createdBy', 'username fullName')
      .lean();
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
const createUser = async (req, res, next) => {
  try {
    const { username, email, password, fullName, role, truckNumber } = req.body;
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
    const userData = {
      username,
      email,
      password,
      fullName,
      role: role || 'employee',
      createdBy: req.user.id
    };
    if (truckNumber) {
      userData.truckNumber = truckNumber;
    }
    const user = await User.create(userData);
    await AuditLog.create({
      action: 'CREATE',
      resource: 'USER',
      resourceId: user._id,
      performedBy: req.user.id,
      details: { username, role: user.role, truckNumber },
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
          role: user.role,
          truckNumber: user.truckNumber
        }
      },
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Create user error:', error);
    next(error);
  }
};
const updateUser = async (req, res, next) => {
  try {
    const { email, fullName, role, isActive, truckNumber, password } = req.body;

    // If password is being updated, we need to select it
    const selectFields = password ? '+password' : '';
    const user = await User.findOne({ _id: req.params.id, isDeleted: false }).select(selectFields);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }
    if (email) user.email = email;
    if (fullName) user.fullName = fullName;
    if (role) user.role = role;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (truckNumber !== undefined) user.truckNumber = truckNumber || null;

    // Admin can reset password without knowing current password
    if (password) {
      user.password = password;
      // Mark password as modified to ensure the pre-save hook runs
      user.markModified('password');
    }

    user.lastUpdatedBy = req.user.id;
    await user.save();

    const auditDetails = { email, fullName, role, isActive, truckNumber };
    if (password) {
      auditDetails.passwordReset = true;
    }

    await AuditLog.create({
      action: 'UPDATE',
      resource: 'USER',
      resourceId: user._id,
      performedBy: req.user.id,
      details: auditDetails,
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
          isActive: user.isActive,
          truckNumber: user.truckNumber
        }
      },
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    next(error);
  }
};
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
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You cannot delete your own account',
          code: 'CANNOT_DELETE_SELF'
        }
      });
    }
    user.isDeleted = true;
    user.deletedAt = Date.now();
    user.deletedBy = req.user.id;
    await user.save();
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
const resetPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    // Need to select password field to update it
    const user = await User.findOne({ _id: req.params.id, isDeleted: false }).select('+password');
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
    // Mark password as modified to ensure the pre-save hook runs
    user.markModified('password');
    await user.save();
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
const updateOwnTruckNumber = async (req, res, next) => {
  try {
    const { truckNumber } = req.body;
    const user = await User.findOne({ _id: req.user.id, isDeleted: false });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }
    user.truckNumber = truckNumber || null;
    await user.save();
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'USER',
      resourceId: user._id,
      performedBy: req.user.id,
      details: { field: 'truckNumber', truckNumber },
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
          isActive: user.isActive,
          truckNumber: user.truckNumber
        }
      },
      message: 'Truck number updated successfully'
    });
  } catch (error) {
    console.error('Update truck number error:', error);
    next(error);
  }
};
module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  updateOwnTruckNumber
};
