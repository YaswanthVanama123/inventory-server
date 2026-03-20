const mongoose = require('mongoose');

const routeStarCustomerBillingInfoSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  billingFrequency: String,
  billingMethod: String,
  billingDay: Number,
  invoiceDelivery: String,
  paymentTerms: String,
  creditCardOnFile: {
    type: Boolean,
    default: false
  },
  achOnFile: {
    type: Boolean,
    default: false
  },
  autoPay: {
    type: Boolean,
    default: false
  },
  statementBalance: Number,
  lastInvoiceDate: Date,
  lastPaymentDate: Date,
  lastPaymentAmount: Number,
  rawData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

routeStarCustomerBillingInfoSchema.index({ customerId: 1 });

module.exports = mongoose.model('RouteStarCustomerBillingInfo', routeStarCustomerBillingInfoSchema);
