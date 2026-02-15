







async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}






async function waitForNetworkIdle(page, timeout = 15000) {
  return await page.waitForLoadState('networkidle', { timeout });
}







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
