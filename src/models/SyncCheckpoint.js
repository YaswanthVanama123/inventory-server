const mongoose = require('mongoose');

/**
 * SyncCheckpoint
 * -------------------------------------------------------------------------
 * Tracks the per-page progress of a streaming scraper so a crashed or
 * interrupted run can resume from the last fully-saved page instead of
 * starting over from page 1.
 *
 * One document per (scraper, entity). It is upserted on every page so the
 * "lastCompletedPage" always reflects data that is already durably stored
 * in MongoDB. When a sync finishes normally it is marked 'completed', which
 * makes the next scheduled run start fresh (data on the source changes over
 * time, so a clean re-scan is desired). If a run is found still
 * 'in_progress' (i.e. the process died mid-run) the next run resumes it.
 */
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
  // Number of the last page whose records were fully written to MongoDB.
  // 0 means nothing has been saved yet (start from the first page).
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
  errorMessage: { type: String }
}, {
  timestamps: true
});

syncCheckpointSchema.index({ scraper: 1, entity: 1 }, { unique: true });

/**
 * Begin (or resume) a checkpoint for a scraper/entity.
 *
 * @param {string} scraper  'customerconnect' | 'routestar'
 * @param {string} entity   'orders' | 'pending_invoices' | ...
 * @param {object} [options]
 * @param {boolean} [options.resume=true]  Resume an interrupted run if one exists.
 * @returns {Promise<{ doc, startPage }>}  startPage = pages to skip on the source.
 */
syncCheckpointSchema.statics.begin = async function (scraper, entity, options = {}) {
  const { resume = true } = options;
  let doc = await this.findOne({ scraper, entity });

  if (doc && resume && doc.status === 'in_progress' && doc.lastCompletedPage > 0) {
    // A previous run died mid-flight — resume after the last saved page.
    return { doc, startPage: doc.lastCompletedPage };
  }

  if (!doc) {
    doc = new this({ scraper, entity });
  }
  // Fresh run: reset counters.
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

/**
 * Record that a page has been fully persisted. Increments running counters.
 */
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
