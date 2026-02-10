const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, '../../../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

/**
 * Capture screenshot
 * @param {Page} page - Playwright page object
 * @param {string} name - Screenshot name
 */
async function captureScreenshot(page, name) {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `${name}-${timestamp}.png`;
    const filepath = path.join(screenshotsDir, filename);

    await page.screenshot({
      path: filepath,
      fullPage: true
    });

    logger.debug('Screenshot captured', { filename });
    return filepath;
  } catch (error) {
    logger.error('Screenshot capture failed', { error: error.message });
    return null;
  }
}

/**
 * Capture element screenshot
 * @param {Page} page - Playwright page object
 * @param {string} selector - CSS selector
 * @param {string} name - Screenshot name
 */
async function captureElementScreenshot(page, selector, name) {
  try {
    const element = await page.$(selector);
    if (!element) {
      logger.warn('Element not found for screenshot', { selector });
      return null;
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `${name}-${timestamp}.png`;
    const filepath = path.join(screenshotsDir, filename);

    await element.screenshot({ path: filepath });

    logger.debug('Element screenshot captured', { filename, selector });
    return filepath;
  } catch (error) {
    logger.error('Element screenshot capture failed', { error: error.message });
    return null;
  }
}

module.exports = {
  captureScreenshot,
  captureElementScreenshot
};
