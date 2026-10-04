const mongoose = require('mongoose');

const syncCheckpointSchema = new mongoose.Schema({
  scraper: {
    type: String,
    required: true,
    enum: ['customerconnect', 'routestar'],
    index: true
  },
  entity: {
    type: String,
    required: true,
    enum: ['orders', 'pending_invoices', 'closed_invoices', 'items', 'customers'],
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: ['in_progress', 'completed', 'failed'],
    default: 'in_progress',
    index: true
  },
  lastCompletedPage: {
    type: Number,
    default: 0
  },
  totalProcessed: { type: Number, default: 0 },
  created: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  deleted: { type: Number, default: 0 },
  detailsFetched: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  errorMessage: { type: String },
  scope: { type: String }
}, {
  timestamps: true
});

syncCheckpointSchema.index({ scraper: 1, entity: 1 }, { unique: true });

syncCheckpointSchema.statics.begin = async function (scraper, entity, options = {}) {
  const { resume = true, scope = null } = options;
  let doc = await this.findOne({ scraper, entity });

  if (
    doc &&
    resume &&
    doc.status === 'in_progress' &&
    doc.lastCompletedPage > 0 &&
    (doc.scope || null) === (scope || null)
  ) {
    return { doc, startPage: doc.lastCompletedPage };
  }

  if (!doc) {
    doc = new this({ scraper, entity });
  }
  doc.scope = scope || undefined;
  doc.status = 'in_progress';
  doc.lastCompletedPage = 0;
  doc.totalProcessed = 0;
  doc.created = 0;
  doc.updated = 0;
  doc.deleted = 0;
  doc.detailsFetched = 0;
  doc.failed = 0;
  doc.startedAt = new Date();
  doc.errorMessage = undefined;
  await doc.save();
  return { doc, startPage: 0 };
};

syncCheckpointSchema.methods.recordPage = async function (pageNumber, counts = {}) {
  this.lastCompletedPage = Math.max(this.lastCompletedPage, pageNumber);
  this.totalProcessed += counts.processed || 0;
  this.created += counts.created || 0;
  this.updated += counts.updated || 0;
  this.detailsFetched += counts.detailsFetched || 0;
  this.failed += counts.failed || 0;
  await this.save();
};

syncCheckpointSchema.methods.finish = async function (status = 'completed', extra = {}) {
  this.status = status;
  if (extra.deleted !== undefined) this.deleted = extra.deleted;
  if (extra.errorMessage) this.errorMessage = extra.errorMessage;
  await this.save();
};

module.exports = mongoose.model('SyncCheckpoint', syncCheckpointSchema);
