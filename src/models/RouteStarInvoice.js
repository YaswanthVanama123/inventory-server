const mongoose = require('mongoose');

/**
 * RouteStar Invoice Model
 * Stores sales/invoice data from RouteStar portal
 * Invoices represent OUTGOING inventory (sales)
 */
const routeStarInvoiceSchema = new mongoose.Schema({
  
  invoiceNumber: {
    type: String,
    required: [true, 'Invoice number is required'],
    unique: true,
    trim: true,
    index: true
  },

  
  invoiceType: {
    type: String,
    enum: ['pending', 'closed'],
    default: 'pending',
    index: true
  },

  
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Closed', 'Cancelled'],
    required: [true, 'Status is required'],
    index: true
  },

  
  invoiceDate: {
    type: Date,
    required: [true, 'Invoice date is required'],
    index: true
  },
  dateCompleted: Date,
  lastModified: Date,

  
  customer: {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      index: true
    },
    link: String
  },

  
  enteredBy: {
    type: String,
    trim: true,
    index: true
  },
  assignedTo: {
    type: String,
    trim: true,
    index: true
  },

  
  stop: Number,
  serviceNotes: String,

  
  isComplete: {
    type: Boolean,
    default: false,
    index: true
  },
  isPosted: {
    type: Boolean,
    default: false
  },

  
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
  total: {
    type: Number,
    required: [true, 'Total is required'],
    default: 0,
    min: [0, 'Total cannot be negative']
  },

  
  payment: String,

  
  arrivalTime: String,
  departureTime: String,
  elapsedTime: String,

  
  lineItems: [{
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true
    },
    description: String,
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      default: 0
    },
    rate: {
      type: Number,
      required: [true, 'Rate is required'],
      default: 0
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      default: 0
    },
    class: String,
    warehouse: String,
    taxCode: String,
    location: String,
    sku: String 
  }],

  
  invoiceDetails: {
    signedBy: String,
    invoiceMemo: String,
    serviceNotes: String,
    salesTaxRate: String
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
  syncSource: {
    type: String,
    enum: ['pending', 'closed'],
    required: true
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


routeStarInvoiceSchema.index({ invoiceDate: -1, status: 1 });
routeStarInvoiceSchema.index({ 'customer.name': 1, invoiceDate: -1 });
routeStarInvoiceSchema.index({ enteredBy: 1, invoiceDate: -1 });
routeStarInvoiceSchema.index({ assignedTo: 1, invoiceDate: -1 });
routeStarInvoiceSchema.index({ invoiceType: 1, status: 1 });
routeStarInvoiceSchema.index({ stockProcessed: 1, isComplete: 1 });
routeStarInvoiceSchema.index({ lastSyncedAt: -1 });


routeStarInvoiceSchema.virtual('shouldProcessStock').get(function() {
  return !this.stockProcessed &&
         this.isComplete &&
         (this.status === 'Completed' || this.status === 'Closed') &&
         this.lineItems &&
         this.lineItems.length > 0;
});


routeStarInvoiceSchema.pre('save', function(next) {
  if (this.lineItems && this.lineItems.length > 0 && !this.subtotal) {
    this.subtotal = this.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  }

  if (this.subtotal && !this.total) {
    this.total = this.subtotal + (this.tax || 0);
  }

  next();
});


routeStarInvoiceSchema.statics.findByInvoiceNumber = function(invoiceNumber) {
  return this.findOne({ invoiceNumber });
};


routeStarInvoiceSchema.statics.getUnprocessedInvoices = function() {
  return this.find({
    stockProcessed: false,
    isComplete: true,
    status: { $in: ['Completed', 'Closed'] },
    'lineItems.0': { $exists: true }
  }).sort({ invoiceDate: 1 });
};


routeStarInvoiceSchema.statics.getSalesStats = async function(startDate, endDate, options = {}) {
  const matchStage = {
    invoiceDate: { $gte: startDate, $lte: endDate },
    status: { $in: ['Completed', 'Closed'] }
  };

  if (options.customer) {
    matchStage['customer.name'] = options.customer;
  }

  if (options.assignedTo) {
    matchStage.assignedTo = options.assignedTo;
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$total' },
        totalInvoices: { $sum: 1 },
        averageInvoiceValue: { $avg: '$total' },
        totalSubtotal: { $sum: '$subtotal' },
        totalTax: { $sum: '$tax' }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result.length > 0 ? result[0] : {
    totalSales: 0,
    totalInvoices: 0,
    averageInvoiceValue: 0,
    totalSubtotal: 0,
    totalTax: 0
  };
};


routeStarInvoiceSchema.statics.getTopCustomers = async function(startDate, endDate, limit = 10) {
  const pipeline = [
    {
      $match: {
        invoiceDate: { $gte: startDate, $lte: endDate },
        status: { $in: ['Completed', 'Closed'] }
      }
    },
    {
      $group: {
        _id: '$customer.name',
        totalSales: { $sum: '$total' },
        invoiceCount: { $sum: 1 },
        averageInvoice: { $avg: '$total' }
      }
    },
    { $sort: { totalSales: -1 } },
    { $limit: limit }
  ];

  return this.aggregate(pipeline);
};


routeStarInvoiceSchema.statics.upsertInvoice = async function(invoiceData) {
  const { invoiceNumber } = invoiceData;

  return this.findOneAndUpdate(
    { invoiceNumber },
    {
      ...invoiceData,
      lastSyncedAt: new Date()
    },
    {
      upsert: true,
      new: true,
      runValidators: true
    }
  );
};


routeStarInvoiceSchema.methods.markStockProcessed = function(error = null) {
  this.stockProcessed = !error;
  this.stockProcessedAt = new Date();
  if (error) {
    this.stockProcessingError = error.message || error;
  }
  return this.save();
};

const RouteStarInvoice = mongoose.model('RouteStarInvoice', routeStarInvoiceSchema);

module.exports = RouteStarInvoice;
