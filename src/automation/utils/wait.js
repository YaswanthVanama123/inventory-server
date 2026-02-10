/**
 * Wait utilities for automation
 */

/**
 * Simple wait/sleep function
 * @param {number} ms - Milliseconds to wait
 */
async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for network to be idle
 * @param {Page} page - Playwright page object
 * @param {number} timeout - Max wait time in ms
 */
async function waitForNetworkIdle(page, timeout = 15000) {
  return await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Wait for element with custom condition
 * @param {Page} page - Playwright page object
 * @param {Function} condition - Condition function
 * @param {Object} options - Wait options
 */
async function waitForCondition(page, condition, options = {}) {
  const { timeout = 30000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await wait(interval);
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for element count to match
 * @param {Page} page - Playwright page object
 * @param {string} selector - CSS selector
 * @param {number} expectedCount - Expected element count
 * @param {number} timeout - Max wait time
 */
async function waitForElementCount(page, selector, expectedCount, timeout = 10000) {
  return await waitForCondition(
    page,
    async () => {
      const elements = await page.$$(selector);
      return elements.length === expectedCount;
    },
    { timeout }
  );
}

module.exports = {
  wait,
  waitForNetworkIdle,
  waitForCondition,
  waitForElementCount
};
