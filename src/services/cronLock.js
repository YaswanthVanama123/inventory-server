const os = require('os');
const CronLock = require('../models/CronLock');

const HOLDER = `${os.hostname()}:${process.pid}`;

const acquire = async (name, ttlMs) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  try {
    const result = await CronLock.findOneAndUpdate(
      { name, $or: [{ expiresAt: { $lt: now } }, { expiresAt: null }] },
      { $set: { name, holder: HOLDER, acquiredAt: now, expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return result && result.holder === HOLDER;
  } catch (err) {
    if (err && err.code === 11000) return false;
    throw err;
  }
};

const release = async (name) => {
  try {
    await CronLock.updateOne(
      { name, holder: HOLDER },
      { $set: { expiresAt: new Date() } }
    );
  } catch (err) {
    console.error(`[cronLock] release failed for ${name}:`, err.message);
  }
};

const withCronLock = async (name, ttlMs, fn) => {
  const got = await acquire(name, ttlMs);
  if (!got) {
    console.log(`[cronLock] ${name} held by another instance, skipping`);
    return { skipped: true };
  }
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    await release(name);
  }
};

module.exports = { withCronLock, acquire, release, HOLDER };
