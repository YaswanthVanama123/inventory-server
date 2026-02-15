const mongoose = require('mongoose');





const routeStarItemSchema = new mongoose.Schema({
  
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

  
  type: {
    type: String,
    trim: true
  },

  
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

  
  itemDetailUrl: {
    type: String,
    trim: true
  },

  warehouseDetailUrl: {
    type: String,
    trim: true
  },

  
  lastSynced: {
    type: Date,
    default: Date.now
  },

  syncSource: {
    type: String,
    default: 'RouteStar',
    immutable: true
  },

  
  forUse: {
    type: Boolean,
    default: false
  },

  forSell: {
    type: Boolean,
    default: false
  },

  
  itemCategory: {
    type: String,
    enum: ['Service', 'Item'],
    default: 'Item'
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});


routeStarItemSchema.index({ itemName: 1 });
routeStarItemSchema.index({ itemParent: 1 });
routeStarItemSchema.index({ type: 1 });
routeStarItemSchema.index({ qtyOnHand: 1 });
routeStarItemSchema.index({ category: 1 });
routeStarItemSchema.index({ department: 1 });
routeStarItemSchema.index({ lastSynced: -1 });
routeStarItemSchema.index({ category: 1, department: 1 });
routeStarItemSchema.index({ mfgPartNumber: 1 }, { sparse: true });


routeStarItemSchema.index({ itemName: 1, itemParent: 1 }, { unique: true });


routeStarItemSchema.virtual('availableQuantity').get(function() {
  return this.qtyOnHand - this.allocated;
});


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


routeStarItemSchema.statics.getByCategory = async function(category) {
  return await this.find({ category }).sort({ itemName: 1 });
};


routeStarItemSchema.statics.getByDepartment = async function(department) {
  return await this.find({ department }).sort({ itemName: 1 });
};


routeStarItemSchema.statics.getLowStock = async function(threshold = 10) {
  return await this.find({ qtyOnHand: { $lte: threshold } })
    .sort({ qtyOnHand: 1 });
};


routeStarItemSchema.statics.getItemsInStock = async function() {
  return await this.find({ qtyOnHand: { $gt: 0 } })
    .sort({ itemName: 1 });
};


routeStarItemSchema.methods.updateStock = async function(qtyOnHand, qtyOnWarehouse, allocated) {
  this.qtyOnHand = qtyOnHand !== undefined ? qtyOnHand : this.qtyOnHand;
  this.qtyOnWarehouse = qtyOnWarehouse !== undefined ? qtyOnWarehouse : this.qtyOnWarehouse;
  this.allocated = allocated !== undefined ? allocated : this.allocated;
  this.lastSynced = new Date();
  return await this.save();
};


routeStarItemSchema.pre('save', function(next) {
  this.lastSynced = new Date();
  next();
});

const RouteStarItem = mongoose.model('RouteStarItem', routeStarItemSchema);

module.exports = RouteStarItem;
