const mongoose = require('mongoose');

const routeStarCustomerContactSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  contactId: String,
  contactName: String,
  notifyBy: String,
  email: String,
  phone: String,
  rawData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

routeStarCustomerContactSchema.index({ customerId: 1 });

module.exports = mongoose.model('RouteStarCustomerContact', routeStarCustomerContactSchema);
