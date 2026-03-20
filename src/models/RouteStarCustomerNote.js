const mongoose = require('mongoose');

const routeStarCustomerNoteSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  noteId: String,
  noteText: String,
  noteType: String,
  createdBy: String,
  createdDate: Date,
  isImportant: {
    type: Boolean,
    default: false
  },
  rawData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

routeStarCustomerNoteSchema.index({ customerId: 1 });

module.exports = mongoose.model('RouteStarCustomerNote', routeStarCustomerNoteSchema);
