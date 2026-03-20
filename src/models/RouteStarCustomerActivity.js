const mongoose = require('mongoose');

const routeStarCustomerActivitySchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  activityId: String,
  activityType: String,
  activityDate: Date,
  description: String,
  performedBy: String,
  status: String,
  amount: Number,
  invoiceNumber: String,
  workOrderNumber: String,
  rawData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

routeStarCustomerActivitySchema.index({ customerId: 1 });

module.exports = mongoose.model('RouteStarCustomerActivity', routeStarCustomerActivitySchema);
