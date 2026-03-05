const mongoose = require('mongoose');


const orderDiscrepancySchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: [true, 'Order ID is required'],
    index: true
  },
  orderNumber: {
    type: String,
    required: [true, 'Order number is required'],
    trim: true,
    index: true
  },
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    uppercase: true,
    trim: true,
    index: true
  },
  itemName: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },
  expectedQuantity: {
    type: Number,
    required: [true, 'Expected quantity is required'],
    min: [0, 'Expected quantity cannot be negative']
  },
  receivedQuantity: {
    type: Number,
    required: [true, 'Received quantity is required'],
    min: [0, 'Received quantity cannot be negative']
  },
  discrepancyQuantity: {
    type: Number,
    required: [true, 'Discrepancy quantity is required']
  },
  discrepancyType: {
    type: String,
    required: [true, 'Discrepancy type is required'],
    enum: ['Shortage', 'Overage', 'Matched'],
    index: true
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Reported by is required']
  },
  reportedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  resolutionNotes: {
    type: String,
    trim: true
  },
  stockProcessed: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});
orderDiscrepancySchema.index({ orderId: 1, sku: 1 });
orderDiscrepancySchema.index({ status: 1, reportedAt: -1 });
orderDiscrepancySchema.index({ discrepancyType: 1 });
orderDiscrepancySchema.virtual('absoluteDiscrepancy').get(function() {
  return Math.abs(this.discrepancyQuantity);
});
orderDiscrepancySchema.methods.approve = async function(userId, notes) {
  this.status = 'approved';
  this.resolvedBy = userId;
  this.resolvedAt = new Date();
  if (notes) this.resolutionNotes = notes;
  return await this.save();
};
orderDiscrepancySchema.methods.reject = async function(userId, notes) {
  this.status = 'rejected';
  this.resolvedBy = userId;
  this.resolvedAt = new Date();
  if (notes) this.resolutionNotes = notes;
  return await this.save();
};
orderDiscrepancySchema.statics.createDiscrepancy = async function(data) {
  const discrepancyQuantity = data.receivedQuantity - data.expectedQuantity;
  let discrepancyType = 'Matched';
  if (discrepancyQuantity < 0) {
    discrepancyType = 'Shortage';
  } else if (discrepancyQuantity > 0) {
    discrepancyType = 'Overage';
  }
  return await this.create({
    ...data,
    discrepancyQuantity,
    discrepancyType
  });
};
orderDiscrepancySchema.statics.getPendingDiscrepancies = async function() {
  return await this.find({ status: 'pending' })
    .populate('reportedBy', 'username fullName email')
    .populate('orderId')
    .sort({ reportedAt: -1 });
};
orderDiscrepancySchema.statics.getByOrderId = async function(orderId) {
  return await this.find({ orderId })
    .populate('reportedBy', 'username fullName email')
    .populate('resolvedBy', 'username fullName email')
    .sort({ reportedAt: -1 });
};
const OrderDiscrepancy = mongoose.model('OrderDiscrepancy', orderDiscrepancySchema);
module.exports = OrderDiscrepancy;
