const mongoose = require('mongoose');

const cronLockSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, index: true },
  holder: { type: String, required: true },
  acquiredAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true },
});

cronLockSchema.index({ name: 1, expiresAt: 1 });

module.exports = mongoose.model('CronLock', cronLockSchema);
