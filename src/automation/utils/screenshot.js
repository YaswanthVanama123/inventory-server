const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const logger = require('./Logger'); // Fixed: capital L
const timeoutConfig = require('../config/timeout.config');

const screenshotsDir = path.join(__dirname, '../../../screenshots');

/**
 * Screenshots are a LOCAL DEBUGGING AID ONLY.
 *
 * Two rules, enforced here so no call site can bypass them:
 *   1. Only on failure. Nothing is captured on the happy path — a successful
 *      sync should leave the screenshots folder untouched.
 *   2. Only outside production. On the production server the disk fills up
 *      with full-page PNGs nobody looks at, so capture is off by default.
 *
 * `ENABLE_SCREENSHOTS=true|false` overrides the environment check either way.
 */
function screenshotsEnabled() {
  const override = process.env.ENABLE_SCREENSHOTS;
  if (override !== undefined) {
    return String(override).toLowerCase() === 'true';
  }
  return process.env.NODE_ENV !== 'production';
}

/**
 * Create the folder on first write instead of at import time, so a production
 * process never creates a directory it will never use.
 */
function ensureScreenshotsDir() {
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  return screenshotsDir;
}

function buildFilePath(name) {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  return path.join(ensureScreenshotsDir(), `${name}-${timestamp}.png`);
}

/**
 * Capture a full-page screenshot for an ERROR. No-ops on the happy path
 * environments (production) and returns null so callers can stay unchanged.
 */
async function captureScreenshot(page, name) {
  if (!screenshotsEnabled()) return null;
  if (!page) return null;
  try {
    const filepath = buildFilePath(name);
    await page.screenshot({
      path: filepath,
      fullPage: true,
      timeout: timeoutConfig.screenshot
    });
    logger.debug('Error screenshot captured', { filename: path.basename(filepath) });
    return filepath;
  } catch (error) {
    logger.error('Screenshot capture failed', { error: error.message });
    return null;
  }
}

async function captureElementScreenshot(page, selector, name) {
  if (!screenshotsEnabled()) return null;
  if (!page) return null;
  try {
    const element = await page.$(selector);
    if (!element) {
      logger.warn('Element not found for screenshot', { selector });
      return null;
    }
    const filepath = buildFilePath(name);
    await element.screenshot({
      path: filepath,
      timeout: timeoutConfig.screenshot
    });
    logger.debug('Element error screenshot captured', {
      filename: path.basename(filepath),
      selector
    });
    return filepath;
  } catch (error) {
    logger.error('Element screenshot capture failed', { error: error.message });
    return null;
  }
}

/**
 * Delete every screenshot currently on disk. Used by the nightly cleanup cron
 * so the folder never accumulates — whatever an error produced today is gone
 * by tomorrow.
 */
async function clearScreenshots() {
  const result = { deleted: 0, freedBytes: 0, failed: 0 };
  let entries;
  try {
    entries = await fsp.readdir(screenshotsDir);
  } catch (error) {
    // No folder means nothing was ever captured — that is a success, not an error.
    if (error.code === 'ENOENT') return result;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.png')) continue;
    const filepath = path.join(screenshotsDir, entry);
    try {
      const stat = await fsp.stat(filepath);
      if (!stat.isFile()) continue;
      await fsp.unlink(filepath);
      result.deleted += 1;
      result.freedBytes += stat.size;
    } catch (error) {
      result.failed += 1;
      logger.warn('Failed to delete screenshot', { file: entry, error: error.message });
    }
  }
  return result;
}

module.exports = {
  captureScreenshot,
  captureElementScreenshot,
  clearScreenshots,
  screenshotsEnabled,
  screenshotsDir
};
