const mongoose = require('mongoose');

/**
 * ModelCategory Model
 * Maps order model numbers/SKUs to RouteStar item categories
 */
const modelCategorySchema = new mongoose.Schema({
  modelNumber: {
    type: String,
    required: [true, 'Model number is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },

  categoryItemName: {
    type: String,
    trim: true,
    index: true
  },

  categoryItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RouteStarItem'
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
modelCategorySchema.index({ modelNumber: 1 });
modelCategorySchema.index({ categoryItemName: 1 });
modelCategorySchema.index({ createdAt: -1 });

// Static method to upsert category mapping
modelCategorySchema.statics.upsertMapping = async function(modelNumber, categoryItemName, categoryItemId, userId = null) {
  return this.findOneAndUpdate(
    { modelNumber: modelNumber.toUpperCase() },
    {
      categoryItemName,
      categoryItemId,
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

// Static method to get all mappings
modelCategorySchema.statics.getAllMappings = function() {
  return this.find()
    .populate('categoryItemId', 'itemName itemParent description')
    .sort({ modelNumber: 1 });
};

// Static method to get mapping by model number
modelCategorySchema.statics.getMappingByModel = function(modelNumber) {
  return this.findOne({ modelNumber: modelNumber.toUpperCase() })
    .populate('categoryItemId', 'itemName itemParent description');
};

const ModelCategory = mongoose.model('ModelCategory', modelCategorySchema);

module.exports = ModelCategory;
