const mongoose = require('mongoose');

const fetchHistorySchema = new mongoose.Schema({
  source: {
    type: String,
    required: true,
    enum: ['customer_connect', 'routestar_invoices', 'routestar_items'],
    index: true
  },

  fetchType: {
    type: String,
    required: true,
    enum: ['pending', 'closed', 'all', 'items'],
  },

  status: {
    type: String,
    required: true,
    enum: ['in_progress', 'completed', 'failed', 'cancelled'],
    default: 'in_progress',
    index: true
  },

  startedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },

  completedAt: {
    type: Date
  },

  duration: {
    type: Number, // in milliseconds
  },

  results: {
    totalFetched: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 }
  },

  errorMessage: {
    type: String
  },

  errorDetails: {
    type: mongoose.Schema.Types.Mixed
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed
  },

  triggeredBy: {
    type: String,
    enum: ['manual', 'automatic', 'scheduled'],
    default: 'manual'
  }
}, {
  timestamps: true
});

// Index for efficient querying
fetchHistorySchema.index({ startedAt: -1 });
fetchHistorySchema.index({ source: 1, startedAt: -1 });
fetchHistorySchema.index({ status: 1, startedAt: -1 });

// Auto-delete records older than 10 days
fetchHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 864000 }); // 10 days in seconds

// Virtual for calculating duration if not set
fetchHistorySchema.virtual('calculatedDuration').get(function() {
  if (this.duration) return this.duration;
  if (this.completedAt && this.startedAt) {
    return this.completedAt - this.startedAt;
  }
  if (this.status === 'in_progress') {
    return Date.now() - this.startedAt;
  }
  return null;
});

// Method to mark as completed
fetchHistorySchema.methods.markCompleted = function(results) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  if (results) {
    this.results = { ...this.results, ...results };
  }
  return this.save();
};

// Method to mark as failed
fetchHistorySchema.methods.markFailed = function(errorMessage, errorDetails) {
  this.status = 'failed';
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  this.errorMessage = errorMessage;
  if (errorDetails) {
    this.errorDetails = errorDetails;
  }
  return this.save();
};

// Static method to create new fetch record
fetchHistorySchema.statics.startFetch = async function(source, fetchType, metadata = {}) {
  return await this.create({
    source,
    fetchType,
    status: 'in_progress',
    startedAt: new Date(),
    metadata,
    triggeredBy: metadata.triggeredBy || 'manual'
  });
};

// Static method to get recent history
fetchHistorySchema.statics.getRecentHistory = async function(source = null, limit = 50) {
  const query = source ? { source } : {};
  return await this.find(query)
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();
};

// Static method to get active fetches
fetchHistorySchema.statics.getActiveFetches = async function(source = null) {
  const query = { status: 'in_progress' };
  if (source) {
    query.source = source;
  }
  return await this.find(query).lean();
};

// Static method to get statistics
fetchHistorySchema.statics.getStatistics = async function(source = null, days = 10) {
  const dateFilter = new Date();
  dateFilter.setDate(dateFilter.getDate() - days);

  const matchStage = {
    startedAt: { $gte: dateFilter }
  };

  if (source) {
    matchStage.source = source;
  }

  return await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          source: '$source',
          status: '$status'
        },
        count: { $sum: 1 },
        totalFetched: { $sum: '$results.totalFetched' },
        totalCreated: { $sum: '$results.created' },
        totalUpdated: { $sum: '$results.updated' },
        totalFailed: { $sum: '$results.failed' },
        avgDuration: { $avg: '$duration' }
      }
    },
    {
      $group: {
        _id: '$_id.source',
        stats: {
          $push: {
            status: '$_id.status',
            count: '$count',
            totalFetched: '$totalFetched',
            totalCreated: '$totalCreated',
            totalUpdated: '$totalUpdated',
            totalFailed: '$totalFailed',
            avgDuration: '$avgDuration'
          }
        },
        totalOperations: { $sum: '$count' }
      }
    }
  ]);
};

const FetchHistory = mongoose.model('FetchHistory', fetchHistorySchema);

module.exports = FetchHistory;
