const mongoose = require('mongoose');

const userScreenPermissionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  screenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Screen',
    required: true,
    index: true
  },
  hasAccess: {
    type: Boolean,
    default: true
  },
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  grantedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure one permission record per user-screen combination
userScreenPermissionSchema.index({ userId: 1, screenId: 1 }, { unique: true });

const UserScreenPermission = mongoose.model('UserScreenPermission', userScreenPermissionSchema);

module.exports = UserScreenPermission;
