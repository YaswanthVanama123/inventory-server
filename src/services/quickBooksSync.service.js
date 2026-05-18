const QuickBooksSyncQueue = require('../models/QuickBooksSyncQueue');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const stockService = require('./stock.service');

class QuickBooksSyncService {
  /**
   * Snapshot current stock for all categories and enqueue stock_update records.
   * Called by the hourly cron. Skips items with no canonical mapping.
   */
  async enqueueHourlySnapshot() {
    const startedAt = Date.now();
    const batchId = `SNAP-${Date.now()}`;
    let enqueued = 0;
    let skipped = 0;

    try {
      const summary = await stockService.getStockSummary();
      const allItems = [
        ...(summary.useStock?.items || []),
        ...(summary.sellStock?.items || [])
      ];

      // Deduplicate by categoryName (sell + use can overlap)
      const seen = new Set();
      const ops = [];

      for (const item of allItems) {
        const itemName = item.categoryName;
        if (!itemName || seen.has(itemName.toLowerCase())) {
          skipped++;
          continue;
        }
        seen.add(itemName.toLowerCase());

        const stockRemaining = Number(item.stockRemaining || 0);

        ops.push({
          updateOne: {
            filter: {
              type: 'stock_update',
              itemName,
              status: 'pending'
            },
            update: {
              $set: {
                type: 'stock_update',
                itemName,
                newQuantity: stockRemaining,
                memo: `Hourly stock sync (batch ${batchId})`,
                status: 'pending',
                retries: 0,
                lastError: null,
                sourceRef: { batchId },
                enqueuedAt: new Date()
              }
            },
            upsert: true
          }
        });
        enqueued++;
      }

      if (ops.length > 0) {
        await QuickBooksSyncQueue.bulkWrite(ops, { ordered: false });
      }

      return {
        success: true,
        batchId,
        enqueued,
        skipped,
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      console.error('[QBSync] enqueueHourlySnapshot failed:', error);
      throw error;
    }
  }

  /**
   * Enqueue any new (Approved) discrepancies that haven't been queued yet.
   * Uses sourceRef.discrepancyId for idempotency.
   */
  async enqueueRecentDiscrepancies({ since } = {}) {
    const startedAt = Date.now();
    let enqueued = 0;
    let skipped = 0;

    try {
      const cutoff = since instanceof Date
        ? since
        : new Date(Date.now() - 25 * 60 * 60 * 1000); // last 25 hours by default

      const discrepancies = await StockDiscrepancy.find({
        status: 'Approved',
        reportedAt: { $gte: cutoff }
      })
        .select('_id itemName itemSku categoryName difference discrepancyType reason reportedAt')
        .lean();

      for (const disc of discrepancies) {
        const itemName = disc.itemName || disc.categoryName;
        const difference = Number(disc.difference || 0);
        if (!itemName || difference === 0) {
          skipped++;
          continue;
        }

        const existing = await QuickBooksSyncQueue.findOne({
          'sourceRef.discrepancyId': String(disc._id)
        }).lean();
        if (existing) {
          skipped++;
          continue;
        }

        await QuickBooksSyncQueue.create({
          type: 'discrepancy_adjustment',
          itemName,
          itemSku: disc.itemSku || null,
          quantityDifference: difference,
          memo: `Discrepancy (${disc.discrepancyType || 'adjustment'}): ${disc.reason || ''}`.trim(),
          status: 'pending',
          sourceRef: { discrepancyId: String(disc._id) },
          enqueuedAt: new Date()
        });
        enqueued++;
      }

      return {
        success: true,
        enqueued,
        skipped,
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      console.error('[QBSync] enqueueRecentDiscrepancies failed:', error);
      throw error;
    }
  }

  /**
   * Fetch up to `limit` pending records and atomically mark them as in_progress.
   * QBWC calls this each polling cycle. Returns the records to build QBXML from.
   */
  async claimPending(limit = 25) {
    const claimed = [];
    for (let i = 0; i < limit; i++) {
      const doc = await QuickBooksSyncQueue.findOneAndUpdate(
        { status: 'pending' },
        {
          $set: {
            status: 'in_progress',
            pickedUpAt: new Date()
          }
        },
        { sort: { enqueuedAt: 1 }, new: true }
      );
      if (!doc) break;
      claimed.push(doc);
    }
    return claimed;
  }

  /**
   * Release in_progress records back to pending without incrementing retries.
   * Called when QBWC reports it has no QB session or wants to defer.
   */
  async releaseInProgress(ids) {
    if (!ids || ids.length === 0) return 0;
    const result = await QuickBooksSyncQueue.updateMany(
      { _id: { $in: ids }, status: 'in_progress' },
      { $set: { status: 'pending', pickedUpAt: null } }
    );
    return result.modifiedCount || 0;
  }

  async markSynced(id, qbTxnId = null) {
    return QuickBooksSyncQueue.findByIdAndUpdate(id, {
      $set: {
        status: 'synced',
        syncedAt: new Date(),
        qbTxnId,
        lastError: null
      }
    }, { new: true });
  }

  async markFailed(id, errorMessage) {
    const doc = await QuickBooksSyncQueue.findById(id);
    if (!doc) return null;
    const newRetries = (doc.retries || 0) + 1;
    const giveUp = newRetries >= (doc.maxRetries || 5);
    doc.retries = newRetries;
    doc.lastError = String(errorMessage || '').slice(0, 1000);
    doc.status = giveUp ? 'failed' : 'pending';
    doc.pickedUpAt = null;
    await doc.save();
    return doc;
  }

  async retry(id) {
    return QuickBooksSyncQueue.findByIdAndUpdate(id, {
      $set: {
        status: 'pending',
        retries: 0,
        lastError: null,
        pickedUpAt: null,
        enqueuedAt: new Date()
      }
    }, { new: true });
  }

  async listQueue({ status, type, limit = 100, page = 1 } = {}) {
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      QuickBooksSyncQueue.find(query)
        .sort({ enqueuedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      QuickBooksSyncQueue.countDocuments(query)
    ]);
    return { items, total, page, limit };
  }

  async getStats() {
    const agg = await QuickBooksSyncQueue.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const stats = { pending: 0, in_progress: 0, synced: 0, failed: 0, total: 0 };
    for (const row of agg) {
      stats[row._id] = row.count;
      stats.total += row.count;
    }
    const lastSynced = await QuickBooksSyncQueue.findOne({ status: 'synced' })
      .sort({ syncedAt: -1 })
      .select('syncedAt itemName')
      .lean();
    stats.lastSyncedAt = lastSynced?.syncedAt || null;
    stats.lastSyncedItem = lastSynced?.itemName || null;
    return stats;
  }
}

module.exports = new QuickBooksSyncService();
