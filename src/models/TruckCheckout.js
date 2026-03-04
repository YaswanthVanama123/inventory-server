const mongoose = require('mongoose');

const truckCheckoutSchema = new mongoose.Schema({
  
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

  
  checkoutDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },

  
  itemName: {
    type: String,
    required: true,
    trim: true
  },

  quantityTaking: {
    type: Number,
    required: true,
    min: 0
  },

  remainingQuantity: {
    type: Number,
    required: true
  },

  systemCalculatedRemaining: {
    type: Number  
  },

  hasDiscrepancy: {
    type: Boolean,
    default: false
  },

  discrepancyAccepted: {
    type: Boolean,
    default: false
  },

  discrepancyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockDiscrepancy'
  },

  
  itemsTaken: [{
    name: { type: String },
    sku: { type: String },
    quantity: { type: Number, min: 0 },
    notes: { type: String }
  }],

  
  notes: {
    type: String
  },

  
  status: {
    type: String,
    enum: ['checked_out', 'completed', 'cancelled'],
    default: 'checked_out',
    index: true
  },

  
  completedDate: {
    type: Date
  },

  
  invoiceNumbers: [{
    type: String,
    trim: true
  }],

  
  invoiceType: {
    type: String,
    enum: ['pending', 'closed'],
    default: 'closed'
  },

  
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
      difference: Number, 
      status: String 
    }],
    tallyDate: Date,
    talliedBy: String
  },

  
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

  
  createdBy: {
    type: String
  },

  completedBy: {
    type: String
  }

}, {
  timestamps: true
});


truckCheckoutSchema.index({ employeeName: 1, checkoutDate: -1 });
truckCheckoutSchema.index({ status: 1, checkoutDate: -1 });
truckCheckoutSchema.index({ invoiceNumbers: 1 });
truckCheckoutSchema.index({ 'itemsTaken.name': 1 }); 
truckCheckoutSchema.index({ itemName: 1, status: 1 }); 


truckCheckoutSchema.virtual('totalItemsTaken').get(function() {
  return this.itemsTaken.reduce((sum, item) => sum + item.quantity, 0);
});


truckCheckoutSchema.virtual('totalItemsSold').get(function() {
  if (!this.tallyResults || !this.tallyResults.itemsSold) return 0;
  return this.tallyResults.itemsSold.reduce((sum, item) => sum + item.quantitySold, 0);
});


truckCheckoutSchema.methods.markCompleted = function(invoiceNumbers, invoiceType, completedBy) {
  this.status = 'completed';
  this.completedDate = new Date();
  this.invoiceNumbers = invoiceNumbers;
  this.invoiceType = invoiceType;
  this.completedBy = completedBy;
  return this.save();
};


truckCheckoutSchema.methods.markCancelled = function(reason) {
  this.status = 'cancelled';
  this.notes = this.notes ? `${this.notes}\n\nCancelled: ${reason}` : `Cancelled: ${reason}`;
  return this.save();
};


truckCheckoutSchema.methods.saveTallyResults = function(tallyResults, talliedBy) {
  this.tallyResults = {
    ...tallyResults,
    tallyDate: new Date(),
    talliedBy
  };
  return this.save();
};


truckCheckoutSchema.methods.markStockProcessed = function(error = null) {
  this.stockProcessed = true;
  this.stockProcessedAt = new Date();
  if (error) {
    this.stockProcessingError = error.message || error;
  }
  return this.save();
};


truckCheckoutSchema.statics.getByEmployee = async function(employeeName, limit = 50) {
  return await this.find({ employeeName })
    .sort({ checkoutDate: -1 })
    .limit(limit);
};


truckCheckoutSchema.statics.getActiveCheckouts = async function() {
  return await this.find({ status: 'checked_out' })
    .sort({ checkoutDate: -1 });
};


truckCheckoutSchema.statics.getNeedingStockProcessing = async function() {
  return await this.find({
    status: 'completed',
    stockProcessed: false
  }).sort({ completedDate: 1 });
};


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
