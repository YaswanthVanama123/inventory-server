const mongoose = require('mongoose');

/**
 * OrderDiscrepancy Model
 * Tracks discrepancies found when verifying received purchase orders
 */
const orderDiscrepancySchema = new mongoose.Schema({
  // Reference to the order
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: [true, 'Order ID is required'],
    index: true
  },
  orderNumber: {
    type: String,
    required: [true, 'Order number is required'],
    trim: true,
    index: true
  },

  // Item details
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    uppercase: true,
    trim: true,
    index: true
  },
  itemName: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },

  // Quantities
  expectedQuantity: {
    type: Number,
    required: [true, 'Expected quantity is required'],
    min: [0, 'Expected quantity cannot be negative']
  },
  receivedQuantity: {
    type: Number,
    required: [true, 'Received quantity is required'],
    min: [0, 'Received quantity cannot be negative']
  },
  discrepancyQuantity: {
    type: Number,
    required: [true, 'Discrepancy quantity is required']
  },

  // Discrepancy type
  discrepancyType: {
    type: String,
    required: [true, 'Discrepancy type is required'],
    enum: ['Shortage', 'Overage', 'Matched'],
    index: true
  },

  // Status
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },

  // Who checked/reported
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Reported by is required']
  },
  reportedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Who approved/rejected
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  },

  // Notes
  notes: {
    type: String,
    trim: true
  },
  resolutionNotes: {
    type: String,
    trim: true
  },

  // Stock processed flag
  stockProcessed: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for common queries
orderDiscrepancySchema.index({ orderId: 1, sku: 1 });
orderDiscrepancySchema.index({ status: 1, reportedAt: -1 });
orderDiscrepancySchema.index({ discrepancyType: 1 });

// Virtual for absolute discrepancy value
orderDiscrepancySchema.virtual('absoluteDiscrepancy').get(function() {
  return Math.abs(this.discrepancyQuantity);
});

// Method to approve discrepancy
orderDiscrepancySchema.methods.approve = async function(userId, notes) {
  this.status = 'approved';
  this.resolvedBy = userId;
  this.resolvedAt = new Date();
  if (notes) this.resolutionNotes = notes;
  return await this.save();
};

// Method to reject discrepancy
orderDiscrepancySchema.methods.reject = async function(userId, notes) {
  this.status = 'rejected';
  this.resolvedBy = userId;
  this.resolvedAt = new Date();
  if (notes) this.resolutionNotes = notes;
  return await this.save();
};

// Static method to create discrepancy
orderDiscrepancySchema.statics.createDiscrepancy = async function(data) {
  const discrepancyQuantity = data.receivedQuantity - data.expectedQuantity;

  let discrepancyType = 'Matched';
  if (discrepancyQuantity < 0) {
    discrepancyType = 'Shortage';
  } else if (discrepancyQuantity > 0) {
    discrepancyType = 'Overage';
  }

  return await this.create({
    ...data,
    discrepancyQuantity,
    discrepancyType
  });
};

// Static method to get pending discrepancies
orderDiscrepancySchema.statics.getPendingDiscrepancies = async function() {
  return await this.find({ status: 'pending' })
    .populate('reportedBy', 'username fullName email')
    .populate('orderId')
    .sort({ reportedAt: -1 });
};

// Static method to get discrepancies by order
orderDiscrepancySchema.statics.getByOrderId = async function(orderId) {
  return await this.find({ orderId })
    .populate('reportedBy', 'username fullName email')
    .populate('resolvedBy', 'username fullName email')
    .sort({ reportedAt: -1 });
};

const OrderDiscrepancy = mongoose.model('OrderDiscrepancy', orderDiscrepancySchema);

module.exports = OrderDiscrepancy;
