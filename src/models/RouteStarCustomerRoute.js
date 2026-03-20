const mongoose = require('mongoose');

const routeStarCustomerRouteSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  routeId: String,
  routeName: String,
  routeType: String,
  frequency: String,
  dayOfWeek: String,
  startDate: Date,
  endDate: Date,
  status: String,
  sequence: Number,
  notes: String,
  rawData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

routeStarCustomerRouteSchema.index({ customerId: 1 });

module.exports = mongoose.model('RouteStarCustomerRoute', routeStarCustomerRouteSchema);
