const mongoose = require('mongoose');

const routeStarCustomerSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  customerName: {
    type: String,
    trim: true
  },
  company: {
    type: String,
    trim: true
  },
  contact: {
    type: String,
    trim: true
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },

  email: {
    type: String,
    trim: true
  },
  ccEmail: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  altPhone: {
    type: String,
    trim: true
  },
  mobilePhone: {
    type: String,
    trim: true
  },

  billingAddress1: String,
  billingAddress2: String,
  billingAddress3: String,
  billingCity: String,
  billingState: String,
  billingZip: String,

  serviceAddress1: String,
  serviceAddress2: String,
  serviceAddress3: String,
  serviceCity: String,
  serviceState: String,
  serviceZip: String,
  latitude: Number,
  longitude: Number,
  zone: String,

  accountNumber: String,
  balance: {
    type: Number,
    default: 0
  },
  creditLimit: Number,
  accountValue: Number,

  taxCode: String,
  taxRate: String,
  terms: String,
  preferredPaymentMethod: String,

  customerType: String,
  salesRep: String,
  grouping: String,
  priceLevel: String,
  priceGrouping: String,
  status: String,

  active: {
    type: Boolean,
    default: true
  },
  paperless: {
    type: Boolean,
    default: false
  },
  proofOfService: {
    type: Boolean,
    default: false
  },
  hideMobileEmailOption: {
    type: Boolean,
    default: false
  },
  addChargeOnBatchBilling: {
    type: Boolean,
    default: false
  },

  notificationMethod: String,
  parentCustomer: String,
  billAnotherCustomer: String,
  customerPopupMessage: String,
  hoaCode: String,

  onRoute: String,

  routeMaintPlan: String,
  defaultDeliveryMethod: String,
  mapBook: String,
  mapPage: String,
  blanketPONumber: String,
  taxKeyNo: String,
  permitNumber: String,
  county: String,
  commission: String,
  systemType: String,
  lastServiceDate: Date,
  drivingDirections: String,

  createdDate: Date,
  lastSyncDate: {
    type: Date,
    default: Date.now
  },

  rawData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

routeStarCustomerSchema.index({ customerName: 1 });
routeStarCustomerSchema.index({ email: 1 });
routeStarCustomerSchema.index({ phone: 1 });
routeStarCustomerSchema.index({ accountNumber: 1 });
routeStarCustomerSchema.index({ active: 1 });
routeStarCustomerSchema.index({ customerType: 1 });
routeStarCustomerSchema.index({ salesRep: 1 });
routeStarCustomerSchema.index({ lastSyncDate: 1 });
routeStarCustomerSchema.index({ grouping: 1, active: 1 });
routeStarCustomerSchema.index({ company: 1, active: 1 });

module.exports = mongoose.model('RouteStarCustomer', routeStarCustomerSchema);
