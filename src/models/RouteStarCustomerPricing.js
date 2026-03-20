const mongoose = require('mongoose');

const routeStarCustomerPricingSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  itemId: String,
  itemName: String,
  itemCode: String,
  priceLevel: String,
  unitPrice: Number,
  discount: Number,
  discountType: String,
  effectiveDate: Date,
  expirationDate: Date,
  rawData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

routeStarCustomerPricingSchema.index({ customerId: 1 });

module.exports = mongoose.model('RouteStarCustomerPricing', routeStarCustomerPricingSchema);
