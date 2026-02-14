const mongoose = require('mongoose');

const stockSummarySchema = new mongoose.Schema({
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  availableQty: {
    type: Number,
    required: [true, 'Available quantity is required'],
    min: [0, 'Available quantity cannot be negative'],
    default: 0
  },
  reservedQty: {
    type: Number,
    min: [0, 'Reserved quantity cannot be negative'],
    default: 0
  },
  totalInQty: {
    type: Number,
    default: 0
  },
  totalOutQty: {
    type: Number,
    default: 0
  },
  lastMovement: {
    type: Date,
    index: true
  },
  lowStockThreshold: {
    type: Number,
    min: [0, 'Low stock threshold cannot be negative'],
    default: 10
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

// Index already defined on sku field with unique: true (line 7)
// No need for duplicate index
stockSummarySchema.index({ availableQty: 1 });


stockSummarySchema.virtual('isLowStock').get(function() {
  return this.availableQty <= this.lowStockThreshold;
});


stockSummarySchema.methods.addStock = function(qty) {
  this.availableQty += qty;
  this.totalInQty += qty;
  this.lastMovement = new Date();
  return this;
};

stockSummarySchema.methods.removeStock = function(qty) {
  this.availableQty -= qty;
  this.totalOutQty += qty;
  this.lastMovement = new Date();
  return this;
};


stockSummarySchema.statics.getLowStockItems = function() {
  return this.find({
    $expr: { $lte: ['$availableQty', '$lowStockThreshold'] }
  }).populate('product').sort({ availableQty: 1 });
};

stockSummarySchema.statics.getStockValueByCategory = async function() {
  const pipeline = [
    {
      $lookup: {
        from: 'products',
        localField: 'sku',
        foreignField: 'sku',
        as: 'productInfo'
      }
    },
    { $unwind: '$productInfo' },
    {
      $group: {
        _id: '$productInfo.category',
        totalQty: { $sum: '$availableQty' },
        totalValue: {
          $sum: { $multiply: ['$availableQty', '$productInfo.lastPurchasePrice'] }
        },
        itemCount: { $sum: 1 }
      }
    },
    { $sort: { totalValue: -1 } }
  ];

  return this.aggregate(pipeline);
};


stockSummarySchema.set('toJSON', { virtuals: true });
stockSummarySchema.set('toObject', { virtuals: true });

const StockSummary = mongoose.model('StockSummary', stockSummarySchema);

module.exports = StockSummary;
