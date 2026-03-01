const mongoose = require('mongoose');

const stockDiscrepancySchema = new mongoose.Schema({
  // Invoice reference
  invoiceNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'invoiceType'
  },
  invoiceType: {
    type: String,
    enum: ['RouteStarInvoice', 'CustomerConnectOrder'],
    required: true
  },

  // Item details
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
    trim: true,
    index: true  // Add index for faster queries
  },

  // Stock counts
  systemQuantity: {
    type: Number,
    required: true,
    default: 0
  },
  actualQuantity: {
    type: Number,
    required: true,
    default: 0
  },
  difference: {
    type: Number
  },

  // Discrepancy details
  discrepancyType: {
    type: String,
    enum: ['Overage', 'Shortage', 'Damage', 'Missing'],
    required: true
  },
  reason: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },

  // Status
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Resolved'],
    default: 'Pending',
    index: true
  },

  // Resolution
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: Date,
  resolutionNotes: String,

  // Audit fields
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
}, {
  timestamps: true
});

// Indexes for efficient queries
stockDiscrepancySchema.index({ status: 1, reportedAt: -1 });
stockDiscrepancySchema.index({ invoiceNumber: 1, itemName: 1 });
stockDiscrepancySchema.index({ reportedBy: 1, reportedAt: -1 });

// Virtual for discrepancy percentage
stockDiscrepancySchema.virtual('discrepancyPercentage').get(function() {
  if (this.systemQuantity === 0) return 0;
  return ((this.difference / this.systemQuantity) * 100).toFixed(2);
});

// Pre-save middleware to calculate difference
stockDiscrepancySchema.pre('save', function(next) {
  this.difference = this.actualQuantity - this.systemQuantity;

  // Auto-set discrepancy type based on difference
  if (!this.discrepancyType) {
    if (this.difference > 0) {
      this.discrepancyType = 'Overage';
    } else if (this.difference < 0) {
      this.discrepancyType = 'Shortage';
    }
  }

  next();
});

// Static method to get pending discrepancies
stockDiscrepancySchema.statics.getPendingDiscrepancies = function(options = {}) {
  const query = { status: 'Pending' };

  if (options.startDate) {
    query.reportedAt = { $gte: new Date(options.startDate) };
  }

  if (options.endDate) {
    query.reportedAt = { ...query.reportedAt, $lte: new Date(options.endDate) };
  }

  return this.find(query)
    .populate('reportedBy', 'username fullName')
    .sort({ reportedAt: -1 });
};

// Static method to get discrepancy summary
stockDiscrepancySchema.statics.getSummary = async function(startDate, endDate) {
  const matchStage = {};

  if (startDate) {
    matchStage.reportedAt = { $gte: new Date(startDate) };
  }

  if (endDate) {
    matchStage.reportedAt = { ...matchStage.reportedAt, $lte: new Date(endDate) };
  }

  const summary = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalDifference: { $sum: '$difference' }
      }
    }
  ]);

  const typeBreakdown = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$discrepancyType',
        count: { $sum: 1 },
        totalDifference: { $sum: '$difference' }
      }
    }
  ]);

  return {
    byStatus: summary,
    byType: typeBreakdown,
    total: await this.countDocuments(matchStage)
  };
};

// Method to approve and resolve
stockDiscrepancySchema.methods.approve = function(userId, notes = '') {
  this.status = 'Approved';
  this.resolvedBy = userId;
  this.resolvedAt = new Date();
  this.resolutionNotes = notes;
  return this.save();
};

// Method to reject
stockDiscrepancySchema.methods.reject = function(userId, notes = '') {
  this.status = 'Rejected';
  this.resolvedBy = userId;
  this.resolvedAt = new Date();
  this.resolutionNotes = notes;
  return this.save();
};

const StockDiscrepancy = mongoose.model('StockDiscrepancy', stockDiscrepancySchema);

module.exports = StockDiscrepancy;
