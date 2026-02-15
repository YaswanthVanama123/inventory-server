const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    default: 'pcs',
    enum: ['pcs', 'box', 'kg', 'liter', 'meter', 'pack', 'case', 'dozen']
  },
  category: {
    type: String,
    trim: true,
    index: true
  },
  aliases: [{
    type: String,
    trim: true
  }],
  lastPurchasePrice: {
    type: Number,
    min: [0, 'Purchase price cannot be negative'],
    default: 0
  },
  lastSalePrice: {
    type: Number,
    min: [0, 'Sale price cannot be negative'],
    default: 0
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



productSchema.index({ name: 'text', aliases: 'text' });
productSchema.index({ category: 1, isActive: 1 });


productSchema.methods.addAlias = function(alias) {
  if (!this.aliases.includes(alias.toLowerCase())) {
    this.aliases.push(alias.toLowerCase());
  }
  return this;
};


productSchema.statics.findBySKUOrAlias = async function(searchTerm) {
  const normalizedSearch = searchTerm.toLowerCase().trim();

  return this.findOne({
    $or: [
      { sku: normalizedSearch.toUpperCase() },
      { aliases: normalizedSearch }
    ],
    isActive: true
  });
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
