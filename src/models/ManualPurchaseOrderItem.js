const mongoose = require('mongoose');

const manualPurchaseOrderItemSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  mappedCategoryItemId: {
    type: mongoose.Schema.Types.ObjectId
    // No ref specified - can be either RouteStarItemAlias or RouteStarItem
  },
  mappedCategoryItemName: {
    type: String,
    trim: true,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  vendorName: {
    type: String,
    trim: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
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

// Indexes for query optimization
manualPurchaseOrderItemSchema.index({ sku: 1 });
manualPurchaseOrderItemSchema.index({ name: 1 });
manualPurchaseOrderItemSchema.index({ isActive: 1 });
manualPurchaseOrderItemSchema.index({ createdAt: -1 });
manualPurchaseOrderItemSchema.index({ vendorId: 1 });
manualPurchaseOrderItemSchema.index({ mappedCategoryItemId: 1 });
manualPurchaseOrderItemSchema.index({ isActive: 1, name: 1 }); // Compound index for common query

// Static methods
manualPurchaseOrderItemSchema.statics.upsertItem = async function(sku, data, userId = null) {
  return this.findOneAndUpdate(
    { sku: sku.toUpperCase() },
    {
      ...data,
      sku: sku.toUpperCase(),
      lastUpdatedBy: userId
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );
};

manualPurchaseOrderItemSchema.statics.getActiveItems = function() {
  return this.find({ isActive: true })
    .populate('vendorId', 'name email phone')
    .sort({ name: 1 });
};

manualPurchaseOrderItemSchema.statics.getAllItems = function() {
  return this.find()
    .populate('vendorId', 'name email phone')
    .sort({ name: 1 });
};

manualPurchaseOrderItemSchema.statics.getItemBySku = function(sku) {
  return this.findOne({ sku: sku.toUpperCase() })
    .populate('vendorId', 'name email phone');
};

const ManualPurchaseOrderItem = mongoose.model('ManualPurchaseOrderItem', manualPurchaseOrderItemSchema);

module.exports = ManualPurchaseOrderItem;
