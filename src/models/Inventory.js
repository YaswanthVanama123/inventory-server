const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true,
    maxlength: [200, 'Item name must not exceed 200 characters']
  },
  skuCode: {
    type: String,
    required: [true, 'SKU code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description must not exceed 1000 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  images: [{
    filename: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  primaryImage: {
    type: Number,
    default: 0,
    min: 0
  },
  quantity: {
    current: {
      type: Number,
      required: [true, 'Current quantity is required'],
      min: [0, 'Quantity cannot be negative'],
      default: 0
    },
    minimum: {
      type: Number,
      required: [true, 'Minimum quantity is required'],
      min: [0, 'Minimum quantity cannot be negative'],
      default: 10
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
      default: 'pieces'
    }
  },
  pricing: {
    purchasePrice: {
      type: Number,
      required: [true, 'Purchase price is required'],
      min: [0, 'Purchase price cannot be negative']
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative']
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    profitMargin: {
      type: Number
    }
  },
  supplier: {
    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true
    },
    contactPerson: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    phone: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    leadTime: {
      type: Number,
      min: [0, 'Lead time cannot be negative']
    },
    reorderPoint: {
      type: Number,
      min: [0, 'Reorder point cannot be negative'],
      default: 20
    },
    minimumOrderQuantity: {
      type: Number,
      min: [1, 'Minimum order quantity must be at least 1'],
      default: 1
    }
  },
  stockHistory: [{
    action: {
      type: String,
      enum: ['added', 'removed', 'updated', 'adjusted'],
      required: true
    },
    quantity: Number,
    previousQuantity: Number,
    newQuantity: Number,
    reason: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // Soft delete fields
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

// Indexes for better query performance
inventorySchema.index({ skuCode: 1 }, { unique: true });
inventorySchema.index({ category: 1, isActive: 1 });
inventorySchema.index({ 'quantity.current': 1 });
inventorySchema.index({ createdAt: -1 });

// Calculate profit margin before saving
inventorySchema.pre('save', function(next) {
  if (this.pricing && this.pricing.purchasePrice && this.pricing.sellingPrice) {
    const profit = this.pricing.sellingPrice - this.pricing.purchasePrice;
    this.pricing.profitMargin = this.pricing.purchasePrice > 0
      ? (profit / this.pricing.purchasePrice) * 100
      : 0;
  }

  // Validate primaryImage index
  if (this.images && this.images.length > 0) {
    if (this.primaryImage >= this.images.length) {
      this.primaryImage = 0;
    }
  } else {
    this.primaryImage = 0;
  }

  this.updatedAt = Date.now();
  next();
});

// Virtual for checking if stock is low
inventorySchema.virtual('isLowStock').get(function() {
  return this.quantity.current <= this.quantity.minimum;
});

// Virtual for checking if reorder is needed
inventorySchema.virtual('needsReorder').get(function() {
  return this.quantity.current <= this.supplier.reorderPoint;
});

// Ensure virtuals are included when converting to JSON
inventorySchema.set('toJSON', { virtuals: true });
inventorySchema.set('toObject', { virtuals: true });

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;
