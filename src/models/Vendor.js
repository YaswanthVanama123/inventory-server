const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Vendor name is required'],
    unique: true,
    trim: true,
    index: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  notes: {
    type: String,
    trim: true
  },
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

// Indexes
vendorSchema.index({ name: 1 });
vendorSchema.index({ isActive: 1 });
vendorSchema.index({ createdAt: -1 });

// Static methods
vendorSchema.statics.getActiveVendors = function() {
  return this.find({ isActive: true })
    .sort({ name: 1 });
};

vendorSchema.statics.getAllVendors = function() {
  return this.find()
    .sort({ name: 1 });
};

vendorSchema.statics.getVendorByName = function(name) {
  return this.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
};

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;
