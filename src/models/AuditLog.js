const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: {
      values: [
        'CREATE', 'UPDATE', 'DELETE', 'RESTORE',
        'LOGIN', 'LOGOUT', 'PASSWORD_RESET', 'PASSWORD_CHANGE',
        'SALE', 'STOCK_ADD', 'STOCK_REDUCE', 'STOCK_ADJUST',
        'APPROVE', 'REJECT', 'CANCEL',
        'VIEW', 'DOWNLOAD', 'EXPORT', 'IMPORT',
        'SYNC', 'VERIFY', 'CHECKOUT', 'FETCH'
      ],
      message: '{VALUE} is not a valid action'
    }
  },
  resource: {
    type: String,
    required: [true, 'Resource is required'],
    enum: {
      values: [
        'USER', 'INVENTORY', 'INVOICE', 'SETTINGS', 'AUTH',
        'COUPON', 'PAYMENT_TYPE', 'TRASH', 'PURCHASE',
        'ORDER', 'STOCK', 'DISCREPANCY', 'TRUCK_CHECKOUT',
        'DASHBOARD', 'REPORT', 'ROUTESTAR_INVOICE', 'ROUTESTAR_ITEM',
        'ITEM_ALIAS', 'MODEL_CATEGORY', 'DEVICE'
      ],
      message: '{VALUE} is not a valid resource'
    }
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  resourceName: {
    type: String,
    trim: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Performer is required']
  },
  performedByName: {
    type: String,
    trim: true
  },
  performedByEmail: {
    type: String,
    trim: true
  },
  performedByRole: {
    type: String,
    trim: true
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    uppercase: true
  },
  endpoint: {
    type: String,
    trim: true
  },
  statusCode: {
    type: Number
  },
  duration: {
    type: Number,
    default: 0
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  changes: {
    before: {
      type: mongoose.Schema.Types.Mixed
    },
    after: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  device: {
    type: String,
    enum: ['web', 'mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown'
  },
  browser: {
    type: String
  },
  os: {
    type: String
  },
  location: {
    country: String,
    region: String,
    city: String
  },
  success: {
    type: Boolean,
    default: true
  },
  errorMessage: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, action: 1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ success: 1 });
auditLogSchema.index({ device: 1 });
auditLogSchema.index({ performedByEmail: 1 });

// Virtual for formatted timestamp
auditLogSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York'
  });
});

// Static methods
auditLogSchema.statics.logActivity = async function(logData) {
  try {
    // If performedBy is present, limit to 10 most recent logs per user
    if (logData.performedBy) {
      const userId = logData.performedBy;

      // Count existing logs for this user
      const count = await this.countDocuments({ performedBy: userId });

      // If user has 10 or more logs, delete the oldest ones
      if (count >= 10) {
        const logsToDelete = count - 9; // Keep 9, so new one makes 10

        // Find the oldest logs to delete
        const oldestLogs = await this.find({ performedBy: userId })
          .sort({ timestamp: 1 })
          .limit(logsToDelete)
          .select('_id');

        const idsToDelete = oldestLogs.map(log => log._id);

        // Delete the oldest logs
        await this.deleteMany({ _id: { $in: idsToDelete } });
      }
    }

    // Create the new log entry
    return await this.create(logData);
  } catch (error) {
    console.error('Failed to log activity:', error);
    // Don't throw error - logging should not break the application
    return null;
  }
};

auditLogSchema.statics.getActivityLogs = async function(filters = {}, options = {}) {
  const {
    page = 1,
    limit = 50,
    sortBy = 'timestamp',
    sortOrder = 'desc',
    resource,
    action,
    performedBy,
    startDate,
    endDate,
    success,
    device,
    search
  } = filters;

  const query = {};

  if (resource) query.resource = resource;
  if (action) query.action = action;
  if (performedBy) query.performedBy = performedBy;
  if (success !== undefined) query.success = success;
  if (device) query.device = device;

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  if (search) {
    query.$or = [
      { performedByName: { $regex: search, $options: 'i' } },
      { performedByEmail: { $regex: search, $options: 'i' } },
      { resourceName: { $regex: search, $options: 'i' } },
      { endpoint: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [logs, total] = await Promise.all([
    this.find(query)
      .populate('performedBy', 'username fullName email role')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

auditLogSchema.statics.getActivityStats = async function(filters = {}) {
  const { startDate, endDate, performedBy } = filters;
  const query = {};

  if (performedBy) query.performedBy = performedBy;
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const [
    totalLogs,
    successfulActions,
    failedActions,
    actionBreakdown,
    resourceBreakdown,
    deviceBreakdown,
    topUsers
  ] = await Promise.all([
    this.countDocuments(query),
    this.countDocuments({ ...query, success: true }),
    this.countDocuments({ ...query, success: false }),
    this.aggregate([
      { $match: query },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]),
    this.aggregate([
      { $match: query },
      { $group: { _id: '$resource', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]),
    this.aggregate([
      { $match: query },
      { $group: { _id: '$device', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    this.aggregate([
      { $match: query },
      { $group: {
        _id: '$performedBy',
        count: { $sum: 1 },
        name: { $first: '$performedByName' },
        email: { $first: '$performedByEmail' }
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ])
  ]);

  return {
    totalLogs,
    successfulActions,
    failedActions,
    successRate: totalLogs > 0 ? ((successfulActions / totalLogs) * 100).toFixed(2) : 0,
    actionBreakdown,
    resourceBreakdown,
    deviceBreakdown,
    topUsers
  };
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
