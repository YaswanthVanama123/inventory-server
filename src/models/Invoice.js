const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: [true, 'Invoice number is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  invoiceDate: {
    type: Date,
    required: [true, 'Invoice date is required'],
    default: Date.now,
    index: true
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required'],
    validate: {
      validator: function(value) {
        return value >= this.invoiceDate;
      },
      message: 'Due date must be on or after invoice date'
    }
  },
  customer: {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [200, 'Customer name must not exceed 200 characters']
    },
    email: {
      type: String,
      required: [true, 'Customer email is required'],
      lowercase: true,
      trim: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
      index: true
    },
    phone: {
      type: String,
      required: [true, 'Customer phone is required'],
      trim: true,
      match: [/^[\d\s\-\+\(\)]+$/, 'Please provide a valid phone number']
    },
    address: {
      street: {
        type: String,
        trim: true
      },
      city: {
        type: String,
        trim: true
      },
      state: {
        type: String,
        trim: true
      },
      zipCode: {
        type: String,
        trim: true
      },
      country: {
        type: String,
        trim: true,
        default: 'USA'
      }
    }
  },
  items: [{
    inventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: [true, 'Inventory item is required']
    },
    itemName: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true
    },
    skuCode: {
      type: String,
      required: [true, 'SKU code is required'],
      uppercase: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be a whole number'
      }
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
      default: 'pieces'
    },
    priceAtSale: {
      type: Number,
      required: [true, 'Price at sale is required'],
      min: [0, 'Price cannot be negative']
    },
    subtotal: {
      type: Number,
      required: [true, 'Subtotal is required'],
      min: [0, 'Subtotal cannot be negative']
    }
  }],
  subtotalAmount: {
    type: Number,
    required: [true, 'Subtotal amount is required'],
    min: [0, 'Subtotal amount cannot be negative'],
    default: 0
  },
  discount: {
    type: {
      type: String,
      enum: {
        values: ['percentage', 'fixed'],
        message: '{VALUE} is not a valid discount type'
      },
      default: 'percentage'
    },
    value: {
      type: Number,
      min: [0, 'Discount value cannot be negative'],
      default: 0,
      validate: {
        validator: function(value) {
          if (this.discount.type === 'percentage') {
            return value >= 0 && value <= 100;
          }
          return value >= 0 && value <= this.subtotalAmount;
        },
        message: 'Invalid discount value'
      }
    },
    amount: {
      type: Number,
      min: [0, 'Discount amount cannot be negative'],
      default: 0
    }
  },
  taxRate: {
    type: Number,
    required: [true, 'Tax rate is required'],
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100%'],
    default: 0
  },
  taxAmount: {
    type: Number,
    required: [true, 'Tax amount is required'],
    min: [0, 'Tax amount cannot be negative'],
    default: 0
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative'],
    default: 0,
    index: true
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    default: 'USD',
    uppercase: true,
    trim: true
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: {
      values: ['draft', 'issued', 'paid', 'cancelled'],
      message: '{VALUE} is not a valid status'
    },
    default: 'draft',
    index: true
  },
  paymentStatus: {
    type: String,
    required: [true, 'Payment status is required'],
    enum: {
      values: ['pending', 'paid', 'cancelled'],
      message: '{VALUE} is not a valid payment status'
    },
    default: 'pending',
    index: true
  },
  paymentMethod: {
    type: String,
    enum: {
      values: ['cash', 'card', 'online', 'bank_transfer', 'check', 'other'],
      message: '{VALUE} is not a valid payment method'
    }
  },
  paymentDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes must not exceed 2000 characters']
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: [2000, 'Remarks must not exceed 2000 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required'],
    index: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // Soft delete fields
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

// Compound indexes for better query performance
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ 'customer.email': 1, invoiceDate: -1 });
invoiceSchema.index({ status: 1, paymentStatus: 1 });
invoiceSchema.index({ invoiceDate: -1, createdAt: -1 });
invoiceSchema.index({ createdBy: 1, status: 1 });
invoiceSchema.index({ dueDate: 1, paymentStatus: 1 }); // For overdue invoices

// Static method to generate invoice number in format INV-YYYYMMDD-XXXX
invoiceSchema.statics.generateInvoiceNumber = async function() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const datePrefix = `INV-${year}${month}${day}`;

  // Find the last invoice created today
  const lastInvoice = await this.findOne({
    invoiceNumber: new RegExp(`^${datePrefix}`)
  })
  .sort({ invoiceNumber: -1 })
  .select('invoiceNumber')
  .lean();

  let sequence = 1;
  if (lastInvoice) {
    // Extract sequence number from last invoice
    const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
    sequence = lastSequence + 1;
  }

  // Format sequence with leading zeros (4 digits)
  const sequenceStr = String(sequence).padStart(4, '0');
  return `${datePrefix}-${sequenceStr}`;
};

// Pre-save middleware to auto-generate invoice number if not provided
invoiceSchema.pre('save', async function(next) {
  try {
    // Generate invoice number if this is a new invoice
    if (this.isNew && !this.invoiceNumber) {
      this.invoiceNumber = await this.constructor.generateInvoiceNumber();
    }

    // Calculate item subtotals
    if (this.items && this.items.length > 0) {
      this.items.forEach(item => {
        item.subtotal = item.quantity * item.priceAtSale;
      });
    }

    // Calculate subtotal amount (sum of all item subtotals)
    this.subtotalAmount = this.items.reduce((sum, item) => sum + item.subtotal, 0);

    // Calculate discount amount
    if (this.discount.type === 'percentage') {
      this.discount.amount = (this.subtotalAmount * this.discount.value) / 100;
    } else {
      this.discount.amount = this.discount.value;
    }

    // Calculate amount after discount
    const amountAfterDiscount = this.subtotalAmount - this.discount.amount;

    // Calculate tax amount
    this.taxAmount = (amountAfterDiscount * this.taxRate) / 100;

    // Calculate total amount
    this.totalAmount = amountAfterDiscount + this.taxAmount;

    // Set payment date when payment status changes to paid
    if (this.isModified('paymentStatus') && this.paymentStatus === 'paid' && !this.paymentDate) {
      this.paymentDate = Date.now();
    }

    // Update status based on payment status
    if (this.paymentStatus === 'paid' && this.status !== 'paid') {
      this.status = 'paid';
    }

    // Update timestamp
    this.updatedAt = Date.now();

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-update middleware to recalculate totals
invoiceSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();

  // If items are being updated, recalculate totals
  if (update.$set && update.$set.items) {
    // Calculate item subtotals
    update.$set.items.forEach(item => {
      item.subtotal = item.quantity * item.priceAtSale;
    });

    // Calculate subtotal amount
    const subtotalAmount = update.$set.items.reduce((sum, item) => sum + item.subtotal, 0);
    update.$set.subtotalAmount = subtotalAmount;

    // Calculate discount amount
    const discount = update.$set.discount || {};
    if (discount.type === 'percentage') {
      discount.amount = (subtotalAmount * (discount.value || 0)) / 100;
    } else {
      discount.amount = discount.value || 0;
    }
    update.$set.discount = discount;

    // Calculate amount after discount
    const amountAfterDiscount = subtotalAmount - discount.amount;

    // Calculate tax amount
    const taxRate = update.$set.taxRate || 0;
    update.$set.taxAmount = (amountAfterDiscount * taxRate) / 100;

    // Calculate total amount
    update.$set.totalAmount = amountAfterDiscount + update.$set.taxAmount;
  }

  // Update timestamp
  if (update.$set) {
    update.$set.updatedAt = Date.now();
  }

  next();
});

// Virtual for checking if invoice is overdue
invoiceSchema.virtual('isOverdue').get(function() {
  if (this.paymentStatus === 'paid' || this.status === 'cancelled') {
    return false;
  }
  return new Date() > this.dueDate;
});

// Virtual for days until due
invoiceSchema.virtual('daysUntilDue').get(function() {
  const today = new Date();
  const diffTime = this.dueDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for days overdue
invoiceSchema.virtual('daysOverdue').get(function() {
  if (!this.isOverdue) {
    return 0;
  }
  const today = new Date();
  const diffTime = today - this.dueDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for amount paid (total if paid, 0 otherwise)
invoiceSchema.virtual('amountPaid').get(function() {
  return this.paymentStatus === 'paid' ? this.totalAmount : 0;
});

// Virtual for amount due
invoiceSchema.virtual('amountDue').get(function() {
  return this.paymentStatus === 'paid' ? 0 : this.totalAmount;
});

// Virtual for total items count
invoiceSchema.virtual('totalItems').get(function() {
  return this.items.length;
});

// Virtual for total quantity
invoiceSchema.virtual('totalQuantity').get(function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Instance method to calculate totals (can be called manually)
invoiceSchema.methods.calculateTotals = function() {
  // Calculate item subtotals
  this.items.forEach(item => {
    item.subtotal = item.quantity * item.priceAtSale;
  });

  // Calculate subtotal amount
  this.subtotalAmount = this.items.reduce((sum, item) => sum + item.subtotal, 0);

  // Calculate discount amount
  if (this.discount.type === 'percentage') {
    this.discount.amount = (this.subtotalAmount * this.discount.value) / 100;
  } else {
    this.discount.amount = this.discount.value;
  }

  // Calculate amount after discount
  const amountAfterDiscount = this.subtotalAmount - this.discount.amount;

  // Calculate tax amount
  this.taxAmount = (amountAfterDiscount * this.taxRate) / 100;

  // Calculate total amount
  this.totalAmount = amountAfterDiscount + this.taxAmount;

  return this;
};

// Instance method to mark invoice as paid
invoiceSchema.methods.markAsPaid = function(paymentMethod) {
  this.paymentStatus = 'paid';
  this.status = 'paid';
  this.paymentDate = Date.now();
  if (paymentMethod) {
    this.paymentMethod = paymentMethod;
  }
  return this;
};

// Instance method to mark invoice as cancelled
invoiceSchema.methods.markAsCancelled = function(reason) {
  this.status = 'cancelled';
  this.paymentStatus = 'cancelled';
  if (reason) {
    this.remarks = this.remarks
      ? `${this.remarks}\n\nCancellation Reason: ${reason}`
      : `Cancellation Reason: ${reason}`;
  }
  return this;
};

// Instance method to issue invoice (change from draft to issued)
invoiceSchema.methods.issueInvoice = function() {
  if (this.status === 'draft') {
    this.status = 'issued';
    this.paymentStatus = 'pending';
  }
  return this;
};

// Static method to get overdue invoices
invoiceSchema.statics.getOverdueInvoices = function() {
  return this.find({
    dueDate: { $lt: new Date() },
    paymentStatus: { $ne: 'paid' },
    status: { $ne: 'cancelled' }
  }).sort({ dueDate: 1 });
};

// Static method to get invoices by date range
invoiceSchema.statics.getInvoicesByDateRange = function(startDate, endDate) {
  return this.find({
    invoiceDate: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ invoiceDate: -1 });
};

// Static method to get revenue statistics
invoiceSchema.statics.getRevenueStats = async function(startDate, endDate) {
  const stats = await this.aggregate([
    {
      $match: {
        invoiceDate: {
          $gte: startDate,
          $lte: endDate
        },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        totalInvoices: { $sum: 1 },
        paidInvoices: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] }
        },
        pendingInvoices: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] }
        },
        paidAmount: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0] }
        },
        pendingAmount: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$totalAmount', 0] }
        },
        averageInvoiceValue: { $avg: '$totalAmount' },
        totalTaxCollected: { $sum: '$taxAmount' },
        totalDiscountGiven: { $sum: '$discount.amount' }
      }
    }
  ]);

  return stats.length > 0 ? stats[0] : null;
};

// Ensure virtuals are included when converting to JSON
invoiceSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Remove __v field
    delete ret.__v;
    return ret;
  }
});

invoiceSchema.set('toObject', { virtuals: true });

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;
