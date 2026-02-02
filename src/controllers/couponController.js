const Coupon = require('../models/Coupon');
const AuditLog = require('../models/AuditLog');

// Get all coupons
exports.getAllCoupons = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search = '',
      status = 'all', // all, active, inactive, expired
    } = req.query;

    // Build query - filter out deleted coupons
    const query = { isDeleted: false };

    // Search filter
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Status filter
    if (status === 'active') {
      query.isActive = true;
      query.expiryDate = { $gte: new Date() };
    } else if (status === 'inactive') {
      query.isActive = false;
    } else if (status === 'expired') {
      query.expiryDate = { $lt: new Date() };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Execute query
    const coupons = await Coupon.find(query)
      .populate('createdBy', 'username fullName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Coupon.countDocuments(query);

    res.json({
      coupons,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ message: 'Error fetching coupons', error: error.message });
  }
};

// Get single coupon by ID
exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: false }).populate('createdBy', 'username fullName');

    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.json({ coupon });
  } catch (error) {
    console.error('Error fetching coupon:', error);
    res.status(500).json({ message: 'Error fetching coupon', error: error.message });
  }
};

// Validate and get coupon by code
exports.validateCoupon = async (req, res) => {
  try {
    const { code, subtotal } = req.body;

    if (!code || subtotal === undefined) {
      return res.status(400).json({ message: 'Code and subtotal are required' });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isDeleted: false });

    if (!coupon) {
      return res.status(404).json({ message: 'Invalid coupon code' });
    }

    // Check if coupon is valid
    const validityCheck = coupon.isValid();
    if (!validityCheck.valid) {
      return res.status(400).json({ message: validityCheck.message });
    }

    // Calculate discount
    const discountResult = coupon.calculateDiscount(subtotal);
    if (!discountResult.valid) {
      return res.status(400).json({ message: discountResult.message });
    }

    res.json({
      valid: true,
      coupon: {
        _id: coupon._id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: discountResult.discountAmount,
      },
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({ message: 'Error validating coupon', error: error.message });
  }
};

// Create new coupon
exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minimumPurchase,
      maxDiscount,
      usageLimit,
      expiryDate,
      isActive,
    } = req.body;

    // Validation
    if (!code || !description || !discountType || !discountValue || !expiryDate) {
      return res.status(400).json({
        message: 'Code, description, discount type, discount value, and expiry date are required',
      });
    }

    // Check if coupon code already exists (not deleted)
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase(), isDeleted: false });
    if (existingCoupon) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    // Create coupon
    const coupon = new Coupon({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      minimumPurchase: minimumPurchase || 0,
      maxDiscount: maxDiscount || null,
      usageLimit: usageLimit || null,
      expiryDate: new Date(expiryDate),
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id,
    });

    await coupon.save();

    // Create audit log
    await AuditLog.create({
      action: 'CREATE',
      resource: 'COUPON',
      resourceId: coupon._id,
      performedBy: req.user.id,
      details: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(201).json({
      message: 'Coupon created successfully',
      coupon,
    });
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ message: 'Error creating coupon', error: error.message });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minimumPurchase,
      maxDiscount,
      usageLimit,
      expiryDate,
      isActive,
    } = req.body;

    const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: false });

    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    // Check if code is being changed and if new code already exists
    if (code && code.toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
      if (existingCoupon) {
        return res.status(400).json({ message: 'Coupon code already exists' });
      }
      coupon.code = code.toUpperCase();
    }

    // Update fields
    if (description !== undefined) coupon.description = description;
    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = discountValue;
    if (minimumPurchase !== undefined) coupon.minimumPurchase = minimumPurchase;
    if (maxDiscount !== undefined) coupon.maxDiscount = maxDiscount;
    if (usageLimit !== undefined) coupon.usageLimit = usageLimit;
    if (expiryDate !== undefined) coupon.expiryDate = new Date(expiryDate);
    if (isActive !== undefined) coupon.isActive = isActive;

    await coupon.save();

    // Create audit log
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'COUPON',
      resourceId: coupon._id,
      performedBy: req.user.id,
      details: {
        code: coupon.code,
        changes: req.body,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      message: 'Coupon updated successfully',
      coupon,
    });
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ message: 'Error updating coupon', error: error.message });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: false });

    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    // Soft delete by marking as deleted
    coupon.isDeleted = true;
    coupon.deletedAt = Date.now();
    coupon.deletedBy = req.user?.id || null;
    await coupon.save();

    // Create audit log
    await AuditLog.create({
      action: 'DELETE',
      resource: 'COUPON',
      resourceId: coupon._id,
      performedBy: req.user?.id || null,
      details: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({ message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ message: 'Error deleting coupon', error: error.message });
  }
};

// Increment coupon usage count (called when coupon is used in an order)
exports.incrementUsage = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: false });

    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    coupon.usedCount += 1;
    await coupon.save();

    res.json({
      message: 'Coupon usage updated',
      coupon,
    });
  } catch (error) {
    console.error('Error updating coupon usage:', error);
    res.status(500).json({ message: 'Error updating coupon usage', error: error.message });
  }
};

// Get coupon statistics
exports.getCouponStats = async (req, res) => {
  try {
    const now = new Date();

    const stats = await Promise.all([
      Coupon.countDocuments({ isActive: true, expiryDate: { $gte: now } }), // Active
      Coupon.countDocuments({ isActive: false }), // Inactive
      Coupon.countDocuments({ expiryDate: { $lt: now } }), // Expired
      Coupon.countDocuments({}), // Total
    ]);

    res.json({
      stats: {
        active: stats[0],
        inactive: stats[1],
        expired: stats[2],
        total: stats[3],
      },
    });
  } catch (error) {
    console.error('Error fetching coupon stats:', error);
    res.status(500).json({ message: 'Error fetching coupon stats', error: error.message });
  }
};
