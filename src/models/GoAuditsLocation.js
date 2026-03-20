const mongoose = require('mongoose');

const goAuditsLocationSchema = new mongoose.Schema({
  // GoAudits location ID
  locationId: {
    type: String,
    required: true,
    unique: true
  },

  // Mapping to RouteStarCustomer
  routeStarCustomerId: {
    type: String,
    index: true
  },

  routeStarCustomerName: {
    type: String
  },

  // Location details (synced from GoAudits)
  locationName: {
    type: String,
    required: true
  },

  locationCode: String,

  companyId: String,

  companyName: String,

  address: String,

  postcode: String,

  latitude: Number,

  longitude: Number,

  timeZone: String,

  toEmail: String,

  ccEmail: String,

  bccEmail: String,

  // Sync metadata
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },

  syncStatus: {
    type: String,
    enum: ['synced', 'pending', 'error'],
    default: 'synced'
  },

  syncError: String,

  createdInGoAudits: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// Indexes for efficient querying
goAuditsLocationSchema.index({ routeStarCustomerId: 1 });
goAuditsLocationSchema.index({ locationName: 1 });
goAuditsLocationSchema.index({ companyId: 1 });
goAuditsLocationSchema.index({ lastSyncedAt: -1 });

module.exports = mongoose.model('GoAuditsLocation', goAuditsLocationSchema);
