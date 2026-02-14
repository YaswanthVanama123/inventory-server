const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
  source: {
    type: String,
    required: [true, 'Source is required'],
    enum: ['customerconnect', 'routestar', 'routestar_items'],
    index: true
  },
  startedAt: {
    type: Date,
    required: [true, 'Started at is required'],
    default: Date.now,
    index: true
  },
  endedAt: {
    type: Date
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: ['RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL'],
    default: 'RUNNING',
    index: true
  },
  recordsFound: {
    type: Number,
    default: 0
  },
  recordsInserted: {
    type: Number,
    default: 0
  },
  recordsUpdated: {
    type: Number,
    default: 0
  },
  recordsFailed: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String,
    trim: true
  },
  errorStack: {
    type: String,
    trim: true
  },
  screenshotPath: {
    type: String,
    trim: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  }, 
  triggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});


syncLogSchema.index({ source: 1, startedAt: -1 });
syncLogSchema.index({ status: 1, source: 1 });


syncLogSchema.virtual('duration').get(function() {
  if (!this.endedAt) return null;
  return this.endedAt - this.startedAt; 
});


syncLogSchema.methods.complete = function(success = true, message = null) {
  this.endedAt = new Date();
  if (success) {
    this.status = this.recordsFailed > 0 ? 'PARTIAL' : 'SUCCESS';
  } else {
    this.status = 'FAILED';
    if (message) this.errorMessage = message;
  }
  return this;
};


syncLogSchema.statics.getLatestSync = function(source) {
  return this.findOne({ source }).sort({ startedAt: -1 });
};

syncLogSchema.statics.getRecentSyncs = function(source, limit = 10) {
  const query = source ? { source } : {};
  return this.find(query)
    .sort({ startedAt: -1 })
    .limit(limit)
    .populate('triggeredBy', 'username fullName');
};

syncLogSchema.statics.getSyncStats = async function(source, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const pipeline = [
    {
      $match: {
        source,
        startedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalSyncs: { $sum: 1 },
        successfulSyncs: {
          $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
        },
        failedSyncs: {
          $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
        },
        totalRecordsInserted: { $sum: '$recordsInserted' },
        totalRecordsUpdated: { $sum: '$recordsUpdated' },
        totalRecordsFailed: { $sum: '$recordsFailed' },
        averageDuration: {
          $avg: {
            $subtract: ['$endedAt', '$startedAt']
          }
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result.length > 0 ? result[0] : null;
};


syncLogSchema.set('toJSON', { virtuals: true });
syncLogSchema.set('toObject', { virtuals: true });

const SyncLog = mongoose.model('SyncLog', syncLogSchema);

module.exports = SyncLog;
