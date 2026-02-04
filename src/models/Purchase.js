const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    required: [true, 'Inventory item reference is required'],
    index: true
  },
  purchaseDate: {
    type: Date,
    required: [true, 'Purchase date is required'],
    default: Date.now,
    index: true
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0, 'Quantity cannot be negative']
  },
  unit: {
    type: String,
    required: [true, 'Unit is required']
  },
  purchasePrice: {
    type: Number,
    required: [true, 'Purchase price is required'],
    min: [0, 'Purchase price cannot be negative']
  },
  sellingPrice: {
    type: Number,
    min: [0, 'Selling price cannot be negative'],
    default: 0
  },
  totalCost: {
    type: Number,
    required: true
  },
  supplier: {
    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true
    },
    contactPerson: String,
    email: String,
    phone: String,
    address: String
  },
  batchNumber: {
    type: String,
    trim: true
  },
  expiryDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes must not exceed 500 characters']
  },
  invoiceNumber: {
    type: String,
    trim: true
  },
  remainingQuantity: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  deletionStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none',
    index: true
  },
  deletionRequestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  deletionRequestedAt: {
    type: Date,
    default: null
  },
  deletionApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  deletionApprovedAt: {
    type: Date,
    default: null
  },
  deletionRejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  deletionRejectedAt: {
    type: Date,
    default: null
  },
  deletionReason: {
    type: String,
    trim: true,
    default: null
  }
}, {
  timestamps: true
});

purchaseSchema.index({ inventoryItem: 1, purchaseDate: -1 });
purchaseSchema.index({ purchaseDate: -1 });
purchaseSchema.index({ isDeleted: 1, isActive: 1 });

purchaseSchema.pre('save', function(next) {
  if (this.isModified('quantity') || this.isModified('purchasePrice')) {
    this.totalCost = this.quantity * this.purchasePrice;
  }

  if (!this.remainingQuantity && this.remainingQuantity !== 0) {
    this.remainingQuantity = this.quantity;
  }

  next();
});

purchaseSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return this.expiryDate < new Date();
});

purchaseSchema.virtual('isFullyConsumed').get(function() {
  return this.remainingQuantity === 0;
});

purchaseSchema.set('toJSON', { virtuals: true });
purchaseSchema.set('toObject', { virtuals: true });

const Purchase = mongoose.model('Purchase', purchaseSchema);

module.exports = Purchase;
