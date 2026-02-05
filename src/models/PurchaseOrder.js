const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  source: {
    type: String,
    required: [true, 'Source is required'],
    enum: ['customerconnect', 'manual'],
    default: 'customerconnect',
    index: true
  },
  sourceOrderId: {
    type: String,
    required: [true, 'Source order ID is required'],
    trim: true,
    index: true
  },
  orderNumber: {
    type: String,
    required: [true, 'Order number is required'],
    trim: true,
    index: true
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: ['pending', 'confirmed', 'received', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  orderDate: {
    type: Date,
    required: [true, 'Order date is required'],
    index: true
  },
  vendor: {
    name: {
      type: String,
      required: [true, 'Vendor name is required'],
      trim: true
    },
    email: String,
    phone: String,
    address: String
  },
  items: [{
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      uppercase: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true
    },
    qty: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative']
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    lineTotal: {
      type: Number,
      required: [true, 'Line total is required'],
      min: [0, 'Line total cannot be negative']
    },
    rawText: String 
  }],
  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    min: [0, 'Subtotal cannot be negative'],
    default: 0
  },
  tax: {
    type: Number,
    min: [0, 'Tax cannot be negative'],
    default: 0
  },
  shipping: {
    type: Number,
    min: [0, 'Shipping cannot be negative'],
    default: 0
  },
  total: {
    type: Number,
    required: [true, 'Total is required'],
    min: [0, 'Total cannot be negative'],
    default: 0
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  raw: {
    type: mongoose.Schema.Types.Mixed
  }, 
  stockProcessed: {
    type: Boolean,
    default: false,
    index: true
  }, 
  stockProcessedAt: Date,
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});


purchaseOrderSchema.index({ source: 1, sourceOrderId: 1 }, { unique: true });
purchaseOrderSchema.index({ orderDate: -1, status: 1 });
purchaseOrderSchema.index({ 'vendor.name': 1 });


purchaseOrderSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce((sum, item) => sum + item.lineTotal, 0);
    this.total = this.subtotal + this.tax + this.shipping;
  }
  next();
});


purchaseOrderSchema.statics.findBySourceOrderId = function(source, sourceOrderId) {
  return this.findOne({ source, sourceOrderId });
};

purchaseOrderSchema.statics.getUnprocessedOrders = function() {
  return this.find({
    stockProcessed: false,
    status: { $in: ['confirmed', 'received', 'completed'] }
  }).sort({ orderDate: 1 });
};

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

module.exports = PurchaseOrder;
