const cron = require('node-cron');
const { clearScreenshots, screenshotsEnabled, screenshotsDir } = require('../automation/utils/screenshot');

// 11:30 PM, business timezone (Virginia) — same convention as the sync crons.
const DEFAULT_CRON = '30 23 * * *';

/**
 * Nightly screenshot cleanup.
 *
 * Scrapers only write screenshots when something FAILS, and only outside
 * production. This wipes whatever today's failures produced so the folder
 * never accumulates — nothing is kept overnight.
 *
 * Deliberately standalone rather than part of the sync scheduler: that one
 * only starts when AUTO_START_SCHEDULER=true, which is usually off on a dev
 * machine — precisely where screenshots are written. This task is filesystem
 * only (no DB, no browser), so it is safe to always run.
 */
class ScreenshotCleanupScheduler {
  constructor() {
    this.task = null;
  }

  get isRunning() {
    return Boolean(this.task);
  }

  start(options = {}) {
    const cronExpression = options.cronExpression
      || process.env.SCREENSHOT_CLEANUP_CRON
      || DEFAULT_CRON;
    const timezone = options.timezone || process.env.TZ || 'America/New_York';

    if (this.task) {
      console.log('Screenshot cleanup already scheduled');
      return;
    }
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid screenshot cleanup cron expression: ${cronExpression}`);
    }

    this.task = cron.schedule(
      cronExpression,
      () => { this.runNow(); },
      { scheduled: true, timezone }
    );
    console.log(`Screenshot cleanup scheduled: ${cronExpression} (${timezone}) — deletes all screenshots in ${screenshotsDir}`);
  }

  /** Delete everything now. Safe to call repeatedly; deleting is idempotent. */
  async runNow() {
    try {
      const result = await clearScreenshots();
      if (result.deleted > 0) {
        const freedKb = Math.round(result.freedBytes / 1024);
        console.log(`Screenshot cleanup: deleted ${result.deleted} screenshot(s), freed ${freedKb} KB`);
      } else {
        console.log('Screenshot cleanup: nothing to delete');
      }
      if (result.failed > 0) {
        console.warn(`Screenshot cleanup: ${result.failed} file(s) could not be deleted`);
      }
      return result;
    } catch (error) {
      console.error('Screenshot cleanup failed:', error.message);
      return { deleted: 0, freedBytes: 0, failed: 0, error: error.message };
    }
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('Screenshot cleanup schedule stopped');
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      captureEnabled: screenshotsEnabled(),
      cronExpression: process.env.SCREENSHOT_CLEANUP_CRON || DEFAULT_CRON,
      timezone: process.env.TZ || 'America/New_York',
      screenshotsDir
    };
  }
}

let instance = null;
const getScreenshotCleanupScheduler = () => {
  if (!instance) instance = new ScreenshotCleanupScheduler();
  return instance;
};

module.exports = { getScreenshotCleanupScheduler, ScreenshotCleanupScheduler };
