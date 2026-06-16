const AuditLog = require('../models/AuditLog');

const FLUSH_THRESHOLD = parseInt(process.env.AUDIT_FLUSH_THRESHOLD) || 200;
const FLUSH_INTERVAL_MS = parseInt(process.env.AUDIT_FLUSH_INTERVAL_MS) || 5000;
const MAX_QUEUE_SIZE = parseInt(process.env.AUDIT_MAX_QUEUE_SIZE) || 10000;
const PER_USER_RETAIN = parseInt(process.env.AUDIT_RETAIN_PER_USER) || 10;

const queue = [];
let flushing = false;
let dropped = 0;

const enqueue = (event) => {
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift();
    dropped += 1;
    if (dropped === 1 || dropped % 1000 === 0) {
      console.warn(`[auditQueue] queue overflow, dropped ${dropped} oldest events`);
    }
    return;
  }
  queue.push(event);
  if (queue.length >= FLUSH_THRESHOLD) {
    setImmediate(flush);
  }
};

const pruneUsers = async (userIds) => {
  for (const userId of userIds) {
    try {
      const count = await AuditLog.countDocuments({ performedBy: userId });
      if (count <= PER_USER_RETAIN) continue;
      const cutoff = await AuditLog.find({ performedBy: userId })
        .sort({ timestamp: -1 })
        .skip(PER_USER_RETAIN)
        .limit(1)
        .select('timestamp')
        .lean();
      if (cutoff.length) {
        await AuditLog.deleteMany({
          performedBy: userId,
          timestamp: { $lt: cutoff[0].timestamp },
        });
      }
    } catch (err) {
      console.error(`[auditQueue] prune failed for user ${userId}:`, err.message);
    }
  }
};

const flush = async () => {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    await AuditLog.insertMany(batch, { ordered: false }).catch((err) => {
      if (!err || err.code !== 11000) {
        console.error('[auditQueue] insertMany failed:', err && err.message);
      }
    });
    const userIds = [
      ...new Set(
        batch
          .map((b) => (b.performedBy ? String(b.performedBy) : null))
          .filter(Boolean)
      ),
    ];
    if (userIds.length > 0) {
      await pruneUsers(userIds);
    }
  } catch (err) {
    console.error('[auditQueue] flush failed:', err.message);
  } finally {
    flushing = false;
  }
};

const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
flushTimer.unref();

const shutdown = async () => {
  clearInterval(flushTimer);
  await flush();
};

const stats = () => ({
  queued: queue.length,
  dropped,
  flushing,
});

module.exports = { enqueue, flush, shutdown, stats };
