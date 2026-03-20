const mongoose = require('mongoose');

const routeStarCustomerEquipmentSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  equipmentId: String,
  equipmentType: String,
  description: String,
  serialNumber: String,
  model: String,
  manufacturer: String,
  installDate: Date,
  lastServiceDate: Date,
  status: String,
  location: String,
  notes: String,
  rawData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

routeStarCustomerEquipmentSchema.index({ customerId: 1 });

module.exports = mongoose.model('RouteStarCustomerEquipment', routeStarCustomerEquipmentSchema);
