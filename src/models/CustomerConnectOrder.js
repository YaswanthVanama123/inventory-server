const mongoose = require('mongoose');






const customerConnectOrderSchema = new mongoose.Schema({
  
  orderNumber: {
    type: String,
    required: [true, 'Order number is required'],
    unique: true,
    trim: true
  },


  poNumber: {
    type: String,
    trim: true
  },

  
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: ['Pending', 'Processing', 'Shipped', 'Complete', 'Cancelled', 'Denied', 'Canceled Reversal', 'Failed', 'Refunded', 'Reversed', 'Chargeback', 'Expired', 'Voided'],
    index: true
  },

  
  orderDate: {
    type: Date,
    required: [true, 'Order date is required'],
    index: true
  },

  
  vendor: {
    name: {
      type: String,
      trim: true,
      index: true
    },
    email: String,
    phone: String
  },

  
  items: [{
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      uppercase: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true
    },
    qty: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative']
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    lineTotal: {
      type: Number,
      required: [true, 'Line total is required'],
      min: [0, 'Line total cannot be negative']
    }
  }],

  
  subtotal: {
    type: Number,
    default: 0,
    min: [0, 'Subtotal cannot be negative']
  },
  tax: {
    type: Number,
    default: 0,
    min: [0, 'Tax cannot be negative']
  },
  shipping: {
    type: Number,
    default: 0,
    min: [0, 'Shipping cannot be negative']
  },
  total: {
    type: Number,
    required: [true, 'Total is required'],
    default: 0,
    min: [0, 'Total cannot be negative']
  },

  
  detailUrl: String,

  
  stockProcessed: {
    type: Boolean,
    default: false,
    index: true
  },
  stockProcessedAt: Date,
  stockProcessingError: String,

  
  lastSyncedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  
  rawData: {
    type: mongoose.Schema.Types.Mixed
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






customerConnectOrderSchema.index({ orderDate: -1, status: 1 });
customerConnectOrderSchema.index({ 'vendor.name': 1, orderDate: -1 });
customerConnectOrderSchema.index({ stockProcessed: 1, status: 1 });
customerConnectOrderSchema.index({ lastSyncedAt: -1 });


customerConnectOrderSchema.virtual('shouldProcessStock').get(function() {
  return !this.stockProcessed &&
         (this.status === 'Complete' || this.status === 'Processing' || this.status === 'Shipped') &&
         this.items &&
         this.items.length > 0;
});


customerConnectOrderSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0 && !this.subtotal) {
    this.subtotal = this.items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
  }

  if (this.subtotal && !this.total) {
    this.total = this.subtotal + (this.tax || 0) + (this.shipping || 0);
  }

  next();
});


customerConnectOrderSchema.statics.findByOrderNumber = function(orderNumber) {
  return this.findOne({ orderNumber });
};


customerConnectOrderSchema.statics.getUnprocessedOrders = function() {
  return this.find({
    stockProcessed: false,
    status: { $in: ['Complete', 'Processing', 'Shipped'] },
    'items.0': { $exists: true }
  }).sort({ orderDate: 1 });
};


customerConnectOrderSchema.statics.getPurchaseStats = async function(startDate, endDate, options = {}) {
  const matchStage = {
    orderDate: { $gte: startDate, $lte: endDate },
    status: { $in: ['Complete', 'Processing', 'Shipped'] }
  };

  if (options.vendor) {
    matchStage['vendor.name'] = options.vendor;
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalPurchases: { $sum: '$total' },
        totalOrders: { $sum: 1 },
        averageOrderValue: { $avg: '$total' },
        totalSubtotal: { $sum: '$subtotal' },
        totalTax: { $sum: '$tax' },
        totalShipping: { $sum: '$shipping' }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result.length > 0 ? result[0] : {
    totalPurchases: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    totalSubtotal: 0,
    totalTax: 0,
    totalShipping: 0
  };
};


customerConnectOrderSchema.statics.getTopVendors = async function(startDate, endDate, limit = 10) {
  const pipeline = [
    {
      $match: {
        orderDate: { $gte: startDate, $lte: endDate },
        status: { $in: ['Complete', 'Processing', 'Shipped'] }
      }
    },
    {
      $group: {
        _id: '$vendor.name',
        totalPurchases: { $sum: '$total' },
        orderCount: { $sum: 1 },
        averageOrder: { $avg: '$total' }
      }
    },
    { $sort: { totalPurchases: -1 } },
    { $limit: limit }
  ];

  return this.aggregate(pipeline);
};


customerConnectOrderSchema.statics.getTopProducts = async function(startDate, endDate, limit = 10) {
  const pipeline = [
    {
      $match: {
        orderDate: { $gte: startDate, $lte: endDate },
        status: { $in: ['Complete', 'Processing', 'Shipped'] }
      }
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: {
          sku: '$items.sku',
          name: '$items.name'
        },
        totalQuantity: { $sum: '$items.qty' },
        totalValue: { $sum: '$items.lineTotal' },
        orderCount: { $sum: 1 }
      }
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: limit }
  ];

  return this.aggregate(pipeline);
};


customerConnectOrderSchema.statics.upsertOrder = async function(orderData) {
  const { orderNumber } = orderData;

  return this.findOneAndUpdate(
    { orderNumber },
    {
      ...orderData,
      lastSyncedAt: new Date()
    },
    {
      upsert: true,
      new: true,
      runValidators: true
    }
  );
};


customerConnectOrderSchema.methods.markStockProcessed = function(error = null) {
  this.stockProcessed = !error;
  this.stockProcessedAt = new Date();
  if (error) {
    this.stockProcessingError = error.message || error;
  }
  return this.save();
};

const CustomerConnectOrder = mongoose.model('CustomerConnectOrder', customerConnectOrderSchema);

module.exports = CustomerConnectOrder;
