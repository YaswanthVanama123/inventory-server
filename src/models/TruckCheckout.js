const mongoose = require('mongoose');

const truckCheckoutSchema = new mongoose.Schema({
  // Employee information
  employeeName: {
    type: String,
    required: true,
    trim: true
  },

  employeeId: {
    type: String,
    trim: true
  },

  truckNumber: {
    type: String,
    trim: true
  },

  // Checkout details
  checkoutDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },

  // Items taken by employee
  itemsTaken: [{
    name: { type: String, required: true },
    sku: { type: String },
    quantity: { type: Number, required: true, min: 0 },
    notes: { type: String }
  }],

  // Notes about the checkout
  notes: {
    type: String
  },

  // Status tracking
  status: {
    type: String,
    enum: ['checked_out', 'completed', 'cancelled'],
    default: 'checked_out',
    index: true
  },

  // Completion details (filled when employee returns)
  completedDate: {
    type: Date
  },

  // Invoice numbers entered by employee after sales
  invoiceNumbers: [{
    type: String,
    trim: true
  }],

  // Type of invoices (pending or closed)
  invoiceType: {
    type: String,
    enum: ['pending', 'closed'],
    default: 'closed'
  },

  // Fetched invoice data from RouteStar
  fetchedInvoices: [{
    invoiceNumber: String,
    customer: String,
    items: [{
      name: String,
      sku: String,
      quantity: Number
    }],
    total: Number,
    fetchedAt: Date
  }],

  // Tally results (comparison between taken and sold)
  tallyResults: {
    itemsTaken: [{
      name: String,
      sku: String,
      quantityTaken: Number
    }],
    itemsSold: [{
      name: String,
      sku: String,
      quantitySold: Number
    }],
    discrepancies: [{
      name: String,
      sku: String,
      quantityTaken: Number,
      quantitySold: Number,
      difference: Number, // negative means sold more than taken, positive means returned
      status: String // 'matched', 'shortage', 'excess'
    }],
    tallyDate: Date,
    talliedBy: String
  },

  // Stock movement tracking
  stockProcessed: {
    type: Boolean,
    default: false
  },

  stockProcessedAt: {
    type: Date
  },

  stockProcessingError: {
    type: String
  },

  // Audit trail
  createdBy: {
    type: String
  },

  completedBy: {
    type: String
  }

}, {
  timestamps: true
});

// Indexes for efficient querying
truckCheckoutSchema.index({ employeeName: 1, checkoutDate: -1 });
truckCheckoutSchema.index({ status: 1, checkoutDate: -1 });
truckCheckoutSchema.index({ invoiceNumbers: 1 });

// Virtual to calculate total items taken
truckCheckoutSchema.virtual('totalItemsTaken').get(function() {
  return this.itemsTaken.reduce((sum, item) => sum + item.quantity, 0);
});

// Virtual to calculate total items sold
truckCheckoutSchema.virtual('totalItemsSold').get(function() {
  if (!this.tallyResults || !this.tallyResults.itemsSold) return 0;
  return this.tallyResults.itemsSold.reduce((sum, item) => sum + item.quantitySold, 0);
});

// Method to mark as completed
truckCheckoutSchema.methods.markCompleted = function(invoiceNumbers, invoiceType, completedBy) {
  this.status = 'completed';
  this.completedDate = new Date();
  this.invoiceNumbers = invoiceNumbers;
  this.invoiceType = invoiceType;
  this.completedBy = completedBy;
  return this.save();
};

// Method to mark as cancelled
truckCheckoutSchema.methods.markCancelled = function(reason) {
  this.status = 'cancelled';
  this.notes = this.notes ? `${this.notes}\n\nCancelled: ${reason}` : `Cancelled: ${reason}`;
  return this.save();
};

// Method to save tally results
truckCheckoutSchema.methods.saveTallyResults = function(tallyResults, talliedBy) {
  this.tallyResults = {
    ...tallyResults,
    tallyDate: new Date(),
    talliedBy
  };
  return this.save();
};

// Method to mark stock as processed
truckCheckoutSchema.methods.markStockProcessed = function(error = null) {
  this.stockProcessed = true;
  this.stockProcessedAt = new Date();
  if (error) {
    this.stockProcessingError = error.message || error;
  }
  return this.save();
};

// Static method to get checkouts by employee
truckCheckoutSchema.statics.getByEmployee = async function(employeeName, limit = 50) {
  return await this.find({ employeeName })
    .sort({ checkoutDate: -1 })
    .limit(limit);
};

// Static method to get active checkouts (not completed or cancelled)
truckCheckoutSchema.statics.getActiveCheckouts = async function() {
  return await this.find({ status: 'checked_out' })
    .sort({ checkoutDate: -1 });
};

// Static method to get checkouts needing stock processing
truckCheckoutSchema.statics.getNeedingStockProcessing = async function() {
  return await this.find({
    status: 'completed',
    stockProcessed: false
  }).sort({ completedDate: 1 });
};

// Static method to get employee statistics
truckCheckoutSchema.statics.getEmployeeStats = async function(employeeName, startDate, endDate) {
  const matchStage = { employeeName };

  if (startDate || endDate) {
    matchStage.checkoutDate = {};
    if (startDate) matchStage.checkoutDate.$gte = new Date(startDate);
    if (endDate) matchStage.checkoutDate.$lte = new Date(endDate);
  }

  return await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$employeeName',
        totalCheckouts: { $sum: 1 },
        completedCheckouts: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        activeCheckouts: {
          $sum: { $cond: [{ $eq: ['$status', 'checked_out'] }, 1, 0] }
        },
        totalInvoices: { $sum: { $size: { $ifNull: ['$invoiceNumbers', []] } } }
      }
    }
  ]);
};

const TruckCheckout = mongoose.model('TruckCheckout', truckCheckoutSchema);

module.exports = TruckCheckout;
