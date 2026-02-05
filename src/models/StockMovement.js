const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    uppercase: true,
    trim: true,
    index: true
  },
  type: {
    type: String,
    required: [true, 'Movement type is required'],
    enum: ['IN', 'OUT', 'ADJUST'],
    index: true
  },
  qty: {
    type: Number,
    required: [true, 'Quantity is required']
  },
  refType: {
    type: String,
    required: [true, 'Reference type is required'],
    enum: ['PURCHASE_ORDER', 'INVOICE', 'MANUAL', 'ADJUSTMENT'],
    index: true
  },
  refId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Reference ID is required'],
    index: true
  },
  sourceRef: {
    type: String,
    trim: true
  }, 
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});


stockMovementSchema.index({ sku: 1, timestamp: -1 });
stockMovementSchema.index({ refType: 1, refId: 1 });
stockMovementSchema.index({ type: 1, timestamp: -1 });


stockMovementSchema.statics.getMovementsBySKU = function(sku, startDate, endDate) {
  const query = { sku: sku.toUpperCase() };

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = startDate;
    if (endDate) query.timestamp.$lte = endDate;
  }

  return this.find(query).sort({ timestamp: -1 });
};

stockMovementSchema.statics.getStockSummaryBySKU = async function(sku) {
  const pipeline = [
    {
      $match: { sku: sku.toUpperCase() }
    },
    {
      $group: {
        _id: '$type',
        totalQty: { $sum: '$qty' },
        count: { $sum: 1 }
      }
    }
  ];

  const result = await this.aggregate(pipeline);

  const summary = {
    sku,
    totalIn: 0,
    totalOut: 0,
    totalAdjust: 0,
    currentStock: 0
  };

  result.forEach(item => {
    if (item._id === 'IN') summary.totalIn = item.totalQty;
    if (item._id === 'OUT') summary.totalOut = item.totalQty;
    if (item._id === 'ADJUST') summary.totalAdjust = item.totalQty;
  });

  summary.currentStock = summary.totalIn - summary.totalOut + summary.totalAdjust;

  return summary;
};

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

module.exports = StockMovement;
