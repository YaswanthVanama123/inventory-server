const mongoose = require('mongoose');

/**
 * RouteStarItemAlias Model
 * Maps different variations of RouteStar item names to a canonical name
 * Example: "jrt-2ply" and "jrt 2pLy" both map to "JRT-2PLY"
 */
const routeStarItemAliasSchema = new mongoose.Schema({
  // The canonical/master name - this is what will be displayed
  canonicalName: {
    type: String,
    required: [true, 'Canonical name is required'],
    trim: true,
    index: true
  },

  // Array of alias names that should map to the canonical name
  aliases: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    // Optional notes about why this alias exists
    notes: {
      type: String,
      trim: true
    }
  }],

  // Optional description for this group
  description: {
    type: String,
    trim: true
  },

  // Track who created/updated this mapping
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Auto-merge flag - if true, automatically use canonical name in reports
  autoMerge: {
    type: Boolean,
    default: true
  },

  // Active flag - allows temporarily disabling a mapping
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for faster queries
routeStarItemAliasSchema.index({ canonicalName: 1 });
routeStarItemAliasSchema.index({ 'aliases.name': 1 });
routeStarItemAliasSchema.index({ isActive: 1 });
routeStarItemAliasSchema.index({ canonicalName: 1, isActive: 1 });

/**
 * Static method to get canonical name for a given item name
 * Returns the canonical name if an alias exists, otherwise returns the original name
 */
routeStarItemAliasSchema.statics.getCanonicalName = async function(itemName) {
  if (!itemName) return itemName;

  const mapping = await this.findOne({
    'aliases.name': itemName,
    isActive: true
  });

  return mapping ? mapping.canonicalName : itemName;
};

/**
 * Static method to get all aliases for a canonical name
 */
routeStarItemAliasSchema.statics.getAliasesByCanonical = async function(canonicalName) {
  const mapping = await this.findOne({ canonicalName, isActive: true });
  return mapping ? mapping.aliases.map(a => a.name) : [];
};

/**
 * Static method to create or update a mapping
 */
routeStarItemAliasSchema.statics.upsertMapping = async function(canonicalName, aliases, userId = null, options = {}) {
  const { description, autoMerge = true } = options;

  return this.findOneAndUpdate(
    { canonicalName },
    {
      canonicalName,
      aliases: aliases.map(a => typeof a === 'string' ? { name: a } : a),
      description,
      autoMerge,
      lastUpdatedBy: userId,
      isActive: true
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );
};

/**
 * Static method to get all active mappings
 */
routeStarItemAliasSchema.statics.getAllActiveMappings = function() {
  return this.find({ isActive: true })
    .sort({ canonicalName: 1 })
    .lean();
};

/**
 * Static method to build a lookup map (alias -> canonical)
 * This is useful for bulk operations
 */
routeStarItemAliasSchema.statics.buildLookupMap = async function() {
  const mappings = await this.find({ isActive: true }).lean();
  const lookupMap = {};

  mappings.forEach(mapping => {
    mapping.aliases.forEach(alias => {
      lookupMap[alias.name] = mapping.canonicalName;
    });
  });

  return lookupMap;
};

/**
 * Static method to find all unique item names from RouteStarItem that need mapping
 */
routeStarItemAliasSchema.statics.getSuggestedMappings = async function() {
  const RouteStarItem = mongoose.model('RouteStarItem');

  // Get all unique item names from RouteStarItem collection
  const uniqueNames = await RouteStarItem.find()
    .select('itemName itemParent qtyOnHand')
    .sort({ itemName: 1 })
    .lean();

  // Get existing mappings
  const existingMappings = await this.buildLookupMap();

  // Filter out already mapped items
  return uniqueNames
    .filter(item => !existingMappings[item.itemName])
    .map(item => ({
      itemName: item.itemName,
      itemParent: item.itemParent,
      occurrences: 1, // Each item appears once in the master list
      totalQuantity: item.qtyOnHand || 0
    }));
};

/**
 * Instance method to add an alias
 */
routeStarItemAliasSchema.methods.addAlias = function(aliasName, notes = null) {
  if (!this.aliases.find(a => a.name === aliasName)) {
    this.aliases.push({ name: aliasName, notes });
  }
  return this.save();
};

/**
 * Instance method to remove an alias
 */
routeStarItemAliasSchema.methods.removeAlias = function(aliasName) {
  this.aliases = this.aliases.filter(a => a.name !== aliasName);
  return this.save();
};

/**
 * Pre-save middleware to ensure no duplicate aliases within the document
 */
routeStarItemAliasSchema.pre('save', function(next) {
  const seenAliases = new Set();
  const uniqueAliases = [];

  this.aliases.forEach(alias => {
    if (!seenAliases.has(alias.name)) {
      seenAliases.add(alias.name);
      uniqueAliases.push(alias);
    }
  });

  this.aliases = uniqueAliases;
  next();
});

const RouteStarItemAlias = mongoose.model('RouteStarItemAlias', routeStarItemAliasSchema);

module.exports = RouteStarItemAlias;
