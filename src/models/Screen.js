const mongoose = require('mongoose');

const screenSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  path: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  icon: {
    type: String,
    default: 'ViewGridIcon'
  },
  category: {
    type: String,
    enum: ['Dashboard', 'RouteStar', 'CustomerConnect', 'GoAudits', 'Reports', 'Settings', 'Other'],
    default: 'Other'
  },
  description: {
    type: String,
    default: ''
  },
  isDefault: {
    type: Boolean,
    default: false,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
screenSchema.index({ isDefault: 1, isActive: 1 });
screenSchema.index({ category: 1, order: 1 });

const Screen = mongoose.model('Screen', screenSchema);

module.exports = Screen;
