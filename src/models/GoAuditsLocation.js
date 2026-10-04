const mongoose = require('mongoose');

const goAuditsLocationSchema = new mongoose.Schema({
  locationId: {
    type: String,
    required: true,
    unique: true
  },

  routeStarCustomerId: {
    type: String,
    index: true
  },

  routeStarCustomerName: {
    type: String
  },

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

goAuditsLocationSchema.index({ routeStarCustomerId: 1 });
goAuditsLocationSchema.index({ locationName: 1 });
goAuditsLocationSchema.index({ companyId: 1 });
goAuditsLocationSchema.index({ lastSyncedAt: -1 });

module.exports = mongoose.model('GoAuditsLocation', goAuditsLocationSchema);
