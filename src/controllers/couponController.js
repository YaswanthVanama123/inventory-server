const Coupon = require('../models/Coupon');
const AuditLog = require('../models/AuditLog');


exports.getAllCoupons = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search = '',
      status = 'all', 
    } = req.query;

    
    const query = { isDeleted: false };

    
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    
    if (status === 'active') {
      query.isActive = true;
      query.expiryDate = { $gte: new Date() };
    } else if (status === 'inactive') {
      query.isActive = false;
    } else if (status === 'expired') {
      query.expiryDate = { $lt: new Date() };
    }

    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    
    const coupons = await Coupon.find(query)
      .populate('createdBy', 'username fullName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    
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

    
    const validityCheck = coupon.isValid();
    if (!validityCheck.valid) {
      return res.status(400).json({ message: validityCheck.message });
    }

    
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

    
    if (!code || !description || !discountType || !discountValue || !expiryDate) {
      return res.status(400).json({
        message: 'Code, description, discount type, discount value, and expiry date are required',
      });
    }

    
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase(), isDeleted: false });
    if (existingCoupon) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    
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

    
    if (code && code.toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
      if (existingCoupon) {
        return res.status(400).json({ message: 'Coupon code already exists' });
      }
      coupon.code = code.toUpperCase();
    }

    
    if (description !== undefined) coupon.description = description;
    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = discountValue;
    if (minimumPurchase !== undefined) coupon.minimumPurchase = minimumPurchase;
    if (maxDiscount !== undefined) coupon.maxDiscount = maxDiscount;
    if (usageLimit !== undefined) coupon.usageLimit = usageLimit;
    if (expiryDate !== undefined) coupon.expiryDate = new Date(expiryDate);
    if (isActive !== undefined) coupon.isActive = isActive;

    await coupon.save();

    
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


exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: false });

    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    
    coupon.isDeleted = true;
    coupon.deletedAt = Date.now();
    coupon.deletedBy = req.user?.id || null;
    await coupon.save();

    
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


exports.getCouponStats = async (req, res) => {
  try {
    const now = new Date();

    const stats = await Promise.all([
      Coupon.countDocuments({ isActive: true, expiryDate: { $gte: now } }), 
      Coupon.countDocuments({ isActive: false }), 
      Coupon.countDocuments({ expiryDate: { $lt: now } }), 
      Coupon.countDocuments({}), 
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
