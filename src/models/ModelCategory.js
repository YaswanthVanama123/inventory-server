const mongoose = require('mongoose');





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


modelCategorySchema.index({ modelNumber: 1 });
modelCategorySchema.index({ categoryItemName: 1 });
modelCategorySchema.index({ createdAt: -1 });


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


modelCategorySchema.statics.getAllMappings = function() {
  return this.find()
    .populate('categoryItemId', 'itemName itemParent description')
    .sort({ modelNumber: 1 });
};


modelCategorySchema.statics.getMappingByModel = function(modelNumber) {
  return this.findOne({ modelNumber: modelNumber.toUpperCase() })
    .populate('categoryItemId', 'itemName itemParent description');
};

const ModelCategory = mongoose.model('ModelCategory', modelCategorySchema);

module.exports = ModelCategory;
