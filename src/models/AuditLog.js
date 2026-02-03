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
        'APPROVE', 'REJECT', 'CANCEL'
      ],
      message: '{VALUE} is not a valid action'
    }
  },
  resource: {
    type: String,
    required: [true, 'Resource is required'],
    enum: {
      values: ['USER', 'INVENTORY', 'INVOICE', 'SETTINGS', 'AUTH', 'COUPON', 'PAYMENT_TYPE', 'TRASH', 'PURCHASE'],
      message: '{VALUE} is not a valid resource'
    }
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Performer is required']
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});


auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, action: 1 });
auditLogSchema.index({ timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
