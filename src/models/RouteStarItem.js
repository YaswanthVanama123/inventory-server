const mongoose = require('mongoose');

/**
 * RouteStar Item Model
 * Stores inventory items data from RouteStar portal
 */
const routeStarItemSchema = new mongoose.Schema({
  // Item identification
  itemName: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },

  itemParent: {
    type: String,
    trim: true
  },

  description: {
    type: String,
    trim: true
  },

  // Pricing
  purchaseCost: {
    type: Number,
    default: 0,
    min: [0, 'Purchase cost cannot be negative']
  },

  salesPrice: {
    type: Number,
    default: 0,
    min: [0, 'Sales price cannot be negative']
  },

  // Item type
  type: {
    type: String,
    trim: true
  },

  // Quantities
  qtyOnOrder: {
    type: Number,
    default: 0
  },

  qtyOnHand: {
    type: Number,
    default: 0
  },

  qtyOnWarehouse: {
    type: Number,
    default: 0
  },

  allocated: {
    type: Number,
    default: 0
  },

  // Item details
  mfgPartNumber: {
    type: String,
    trim: true
  },

  uom: {
    type: String,
    trim: true
  },

  category: {
    type: String,
    trim: true
  },

  department: {
    type: String,
    trim: true
  },

  grouping: {
    type: String,
    trim: true
  },

  taxCode: {
    type: String,
    trim: true
  },

  // Links
  itemDetailUrl: {
    type: String,
    trim: true
  },

  warehouseDetailUrl: {
    type: String,
    trim: true
  },

  // Sync metadata
  lastSynced: {
    type: Date,
    default: Date.now
  },

  syncSource: {
    type: String,
    default: 'RouteStar',
    immutable: true
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries (defined once here, not in field definitions)
routeStarItemSchema.index({ itemName: 1 });
routeStarItemSchema.index({ itemParent: 1 });
routeStarItemSchema.index({ type: 1 });
routeStarItemSchema.index({ qtyOnHand: 1 });
routeStarItemSchema.index({ category: 1 });
routeStarItemSchema.index({ department: 1 });
routeStarItemSchema.index({ lastSynced: -1 });
routeStarItemSchema.index({ category: 1, department: 1 });
routeStarItemSchema.index({ mfgPartNumber: 1 }, { sparse: true });

// Compound index for unique identification (itemName + itemParent combination)
routeStarItemSchema.index({ itemName: 1, itemParent: 1 }, { unique: true });

// Virtual for total available quantity
routeStarItemSchema.virtual('availableQuantity').get(function() {
  return this.qtyOnHand - this.allocated;
});

// Static method to find or create item
routeStarItemSchema.statics.findOrCreate = async function(itemData) {
  const filter = {
    itemName: itemData.itemName,
    itemParent: itemData.itemParent
  };

  const update = {
    ...itemData,
    lastSynced: new Date()
  };

  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  };

  return await this.findOneAndUpdate(filter, update, options);
};

// Static method to get items by category
routeStarItemSchema.statics.getByCategory = async function(category) {
  return await this.find({ category }).sort({ itemName: 1 });
};

// Static method to get items by department
routeStarItemSchema.statics.getByDepartment = async function(department) {
  return await this.find({ department }).sort({ itemName: 1 });
};

// Static method to get low stock items
routeStarItemSchema.statics.getLowStock = async function(threshold = 10) {
  return await this.find({ qtyOnHand: { $lte: threshold } })
    .sort({ qtyOnHand: 1 });
};

// Static method to get items with stock
routeStarItemSchema.statics.getItemsInStock = async function() {
  return await this.find({ qtyOnHand: { $gt: 0 } })
    .sort({ itemName: 1 });
};

// Instance method to update stock
routeStarItemSchema.methods.updateStock = async function(qtyOnHand, qtyOnWarehouse, allocated) {
  this.qtyOnHand = qtyOnHand !== undefined ? qtyOnHand : this.qtyOnHand;
  this.qtyOnWarehouse = qtyOnWarehouse !== undefined ? qtyOnWarehouse : this.qtyOnWarehouse;
  this.allocated = allocated !== undefined ? allocated : this.allocated;
  this.lastSynced = new Date();
  return await this.save();
};

// Pre-save middleware to update lastSynced
routeStarItemSchema.pre('save', function(next) {
  this.lastSynced = new Date();
  next();
});

const RouteStarItem = mongoose.model('RouteStarItem', routeStarItemSchema);

module.exports = RouteStarItem;
