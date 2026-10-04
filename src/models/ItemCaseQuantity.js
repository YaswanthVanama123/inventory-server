const mongoose = require('mongoose');

const itemCaseQuantitySchema = new mongoose.Schema({
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  itemName: {
    type: String,
    trim: true
  },
  unitsPerCase: {
    type: Number,
    required: [true, 'Units per case is required'],
    default: 1,
    min: [1, 'Units per case must be at least 1']
  },
  purchaseUnitLabel: {
    type: String,
    trim: true,
    default: 'Case'
  },
  sellingUnitLabel: {
    type: String,
    trim: true,
    default: 'Each'
  },
  notes: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
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

itemCaseQuantitySchema.index({ isActive: 1, sku: 1 });
itemCaseQuantitySchema.index({ unitsPerCase: -1 });
itemCaseQuantitySchema.index({ createdAt: -1 });

itemCaseQuantitySchema.statics.getUnitsPerCase = async function(sku) {
  if (!sku) return 1;
  const mapping = await this.findOne({ sku: sku.toUpperCase(), isActive: true }).lean();
  return mapping && mapping.unitsPerCase > 0 ? mapping.unitsPerCase : 1;
};

itemCaseQuantitySchema.statics.buildLookupMap = async function() {
  const mappings = await this.find({ isActive: true })
    .select('sku unitsPerCase')
    .lean();
  const lookup = {};
  mappings.forEach(m => {
    if (m.sku && m.unitsPerCase > 0) {
      lookup[m.sku.toUpperCase()] = m.unitsPerCase;
    }
  });
  return lookup;
};

itemCaseQuantitySchema.statics.upsertMapping = async function(sku, data = {}, userId = null) {
  const update = {
    sku: sku.toUpperCase(),
    lastUpdatedBy: userId,
    isActive: true
  };
  if (data.itemName !== undefined) update.itemName = data.itemName;
  if (data.unitsPerCase !== undefined) update.unitsPerCase = data.unitsPerCase;
  if (data.purchaseUnitLabel !== undefined) update.purchaseUnitLabel = data.purchaseUnitLabel;
  if (data.sellingUnitLabel !== undefined) update.sellingUnitLabel = data.sellingUnitLabel;
  if (data.notes !== undefined) update.notes = data.notes;

  return this.findOneAndUpdate(
    { sku: sku.toUpperCase() },
    update,
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );
};

const ItemCaseQuantity = mongoose.model('ItemCaseQuantity', itemCaseQuantitySchema);

module.exports = ItemCaseQuantity;
