const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0,
  },
  minimumPurchase: {
    type: Number,
    default: 0,
    min: 0,
  },
  maxDiscount: {
    type: Number,
    default: null,
    min: 0,
  },
  usageLimit: {
    type: Number,
    default: null,
    min: 0,
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // Soft delete fields
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

// Index for faster code lookups
couponSchema.index({ code: 1 });

// Method to check if coupon is valid
couponSchema.methods.isValid = function() {
  const now = new Date();

  // Check if expired
  if (this.expiryDate < now) {
    return { valid: false, message: 'Coupon has expired' };
  }

  // Check if active
  if (!this.isActive) {
    return { valid: false, message: 'Coupon is inactive' };
  }

  // Check usage limit
  if (this.usageLimit && this.usedCount >= this.usageLimit) {
    return { valid: false, message: 'Coupon usage limit reached' };
  }

  return { valid: true };
};

// Method to calculate discount amount
couponSchema.methods.calculateDiscount = function(subtotal) {
  // Check minimum purchase requirement
  if (subtotal < this.minimumPurchase) {
    return {
      valid: false,
      message: `Minimum purchase of $${this.minimumPurchase} required`,
      discountAmount: 0,
    };
  }

  let discountAmount = 0;

  if (this.discountType === 'fixed') {
    discountAmount = Math.min(this.discountValue, subtotal);
  } else {
    // percentage
    discountAmount = (subtotal * this.discountValue) / 100;

    // Apply max discount cap if set
    if (this.maxDiscount) {
      discountAmount = Math.min(discountAmount, this.maxDiscount);
    }
  }

  return {
    valid: true,
    discountAmount: Math.round(discountAmount * 100) / 100, // Round to 2 decimals
  };
};

module.exports = mongoose.model('Coupon', couponSchema);
