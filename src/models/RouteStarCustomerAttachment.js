const mongoose = require('mongoose');

const routeStarCustomerAttachmentSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  attachmentId: String,
  fileName: String,
  fileType: String,
  fileSize: Number,
  fileUrl: String,
  uploadedBy: String,
  uploadedDate: Date,
  description: String,
  rawData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

routeStarCustomerAttachmentSchema.index({ customerId: 1 });

module.exports = mongoose.model('RouteStarCustomerAttachment', routeStarCustomerAttachmentSchema);
