const mongoose = require('mongoose');






const routeStarItemAliasSchema = new mongoose.Schema({
  
  canonicalName: {
    type: String,
    required: [true, 'Canonical name is required'],
    trim: true,
    index: true
  },

  
  aliases: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    
    notes: {
      type: String,
      trim: true
    }
  }],

  
  description: {
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
  },

  
  autoMerge: {
    type: Boolean,
    default: true
  },

  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});


routeStarItemAliasSchema.index({ canonicalName: 1 });
routeStarItemAliasSchema.index({ 'aliases.name': 1 });
routeStarItemAliasSchema.index({ isActive: 1 });
routeStarItemAliasSchema.index({ canonicalName: 1, isActive: 1 });





routeStarItemAliasSchema.statics.getCanonicalName = async function(itemName) {
  if (!itemName) return itemName;

  const mapping = await this.findOne({
    'aliases.name': itemName,
    isActive: true
  });

  return mapping ? mapping.canonicalName : itemName;
};




routeStarItemAliasSchema.statics.getAliasesByCanonical = async function(canonicalName) {
  const mapping = await this.findOne({ canonicalName, isActive: true });
  return mapping ? mapping.aliases.map(a => a.name) : [];
};




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




routeStarItemAliasSchema.statics.getAllActiveMappings = function() {
  return this.find({ isActive: true })
    .sort({ canonicalName: 1 })
    .lean();
};





routeStarItemAliasSchema.statics.buildLookupMap = async function() {
  const mappings = await this.find({ isActive: true }).lean();
  const lookupMap = {};

  mappings.forEach(mapping => {
    mapping.aliases.forEach(alias => {
      lookupMap[alias.name.toLowerCase()] = mapping.canonicalName;
    });
  });

  return lookupMap;
};




routeStarItemAliasSchema.statics.getSuggestedMappings = async function() {
  const RouteStarItem = mongoose.model('RouteStarItem');

  
  const uniqueNames = await RouteStarItem.find()
    .select('itemName itemParent qtyOnHand')
    .sort({ itemName: 1 })
    .lean();

  
  const existingMappings = await this.buildLookupMap();

  
  return uniqueNames
    .filter(item => !existingMappings[item.itemName])
    .map(item => ({
      itemName: item.itemName,
      itemParent: item.itemParent,
      occurrences: 1, 
      totalQuantity: item.qtyOnHand || 0
    }));
};




routeStarItemAliasSchema.methods.addAlias = function(aliasName, notes = null) {
  if (!this.aliases.find(a => a.name === aliasName)) {
    this.aliases.push({ name: aliasName, notes });
  }
  return this.save();
};




routeStarItemAliasSchema.methods.removeAlias = function(aliasName) {
  this.aliases = this.aliases.filter(a => a.name !== aliasName);
  return this.save();
};




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
