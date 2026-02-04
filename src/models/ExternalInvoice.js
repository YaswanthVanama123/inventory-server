const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  source: {
    type: String,
    required: [true, 'Source is required'],
    enum: ['routestar', 'manual'],
    default: 'routestar',
    index: true
  },
  sourceInvoiceId: {
    type: String,
    required: [true, 'Source invoice ID is required'],
    trim: true,
    index: true
  },
  invoiceNumber: {
    type: String,
    required: [true, 'Invoice number is required'],
    trim: true,
    index: true
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: ['draft', 'issued', 'paid', 'delivered', 'completed', 'cancelled'],
    default: 'issued',
    index: true
  },
  invoiceDate: {
    type: Date,
    required: [true, 'Invoice date is required'],
    index: true
  },
  customer: {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true
    },
    email: String,
    phone: String,
    address: String
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
    },
    rawText: String // Original text from portal if needed for debugging
  }],
  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    min: [0, 'Subtotal cannot be negative'],
    default: 0
  },
  tax: {
    type: Number,
    min: [0, 'Tax cannot be negative'],
    default: 0
  },
  discount: {
    type: Number,
    min: [0, 'Discount cannot be negative'],
    default: 0
  },
  total: {
    type: Number,
    required: [true, 'Total is required'],
    min: [0, 'Total cannot be negative'],
    default: 0
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  raw: {
    type: mongoose.Schema.Types.Mixed
  }, // Store raw extracted data for debugging
  stockProcessed: {
    type: Boolean,
    default: false,
    index: true
  }, // Track if stock movements were created
  stockProcessedAt: Date,
  notes: String,
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

// Compound indexes
invoiceSchema.index({ source: 1, sourceInvoiceId: 1 }, { unique: true });
invoiceSchema.index({ invoiceDate: -1, status: 1 });
invoiceSchema.index({ 'customer.name': 1 });

// Pre-save hook to calculate totals
invoiceSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce((sum, item) => sum + item.lineTotal, 0);
    this.total = this.subtotal + this.tax - this.discount;
  }
  next();
});

// Static methods
invoiceSchema.statics.findBySourceInvoiceId = function(source, sourceInvoiceId) {
  return this.findOne({ source, sourceInvoiceId });
};

invoiceSchema.statics.getUnprocessedInvoices = function() {
  return this.find({
    stockProcessed: false,
    status: { $in: ['paid', 'delivered', 'completed'] }
  }).sort({ invoiceDate: 1 });
};

invoiceSchema.statics.getSalesStats = async function(startDate, endDate) {
  const pipeline = [
    {
      $match: {
        invoiceDate: { $gte: startDate, $lte: endDate },
        status: { $in: ['paid', 'delivered', 'completed'] }
      }
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$total' },
        totalInvoices: { $sum: 1 },
        averageInvoiceValue: { $avg: '$total' }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result.length > 0 ? result[0] : {
    totalSales: 0,
    totalInvoices: 0,
    averageInvoiceValue: 0
  };
};

const ExternalInvoice = mongoose.model('ExternalInvoice', invoiceSchema);

module.exports = ExternalInvoice;
