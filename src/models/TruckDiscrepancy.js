const mongoose = require('mongoose');

const truckDiscrepancySchema = new mongoose.Schema({
  // Truck Information
  employeeName: {
    type: String,
    required: true,
    trim: true
  },
  truckNumber: {
    type: String,
    required: true,
    trim: true
  },

  // Item Information
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  itemSku: {
    type: String,
    trim: true
  },
  categoryName: {
    type: String,
    trim: true
  },

  // Truck Inventory Discrepancy
  systemTruckInventory: {
    type: Number,
    required: true,
    default: 0
  },
  actualTruckInventory: {
    type: Number,
    required: true,
    default: 0
  },
  difference: {
    type: Number,
    required: true,
    default: 0
  },

  // Discrepancy Details
  discrepancyType: {
    type: String,
    enum: ['Overage', 'Shortage', 'Damage', 'Missing'],
    required: true
  },

  // Associated Checkout
  checkoutId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TruckCheckout'
  },

  // Status
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Approved' // Auto-approved when created during checkout
  },

  // Notes
  reason: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },

  // Tracking
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reportedAt: {
    type: Date,
    default: Date.now
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
truckDiscrepancySchema.index({ truckNumber: 1, itemName: 1 });
truckDiscrepancySchema.index({ employeeName: 1 });
truckDiscrepancySchema.index({ status: 1 });
truckDiscrepancySchema.index({ reportedAt: -1 });
truckDiscrepancySchema.index({ checkoutId: 1 });

module.exports = mongoose.model('TruckDiscrepancy', truckDiscrepancySchema);
