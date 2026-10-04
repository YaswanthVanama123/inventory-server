const mongoose = require('mongoose');

const quickBooksSyncQueueSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['stock_update', 'discrepancy_adjustment'],
    required: true,
    index: true
  },
  itemName: {
    type: String,
    required: true,
    index: true
  },
  itemSku: {
    type: String,
    default: null
  },
  newQuantity: {
    type: Number,
    default: null
  },
  quantityDifference: {
    type: Number,
    default: null
  },
  memo: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'synced', 'failed'],
    default: 'pending',
    index: true
  },
  retries: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 5
  },
  lastError: {
    type: String,
    default: null
  },
  qbTxnId: {
    type: String,
    default: null
  },
  sourceRef: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  enqueuedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  pickedUpAt: {
    type: Date,
    default: null
  },
  syncedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

quickBooksSyncQueueSchema.index({ status: 1, enqueuedAt: 1 });
quickBooksSyncQueueSchema.index({ type: 1, itemName: 1, status: 1 });

module.exports = mongoose.model('QuickBooksSyncQueue', quickBooksSyncQueueSchema);
