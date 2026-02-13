module.exports = {
  headless: process.env.HEADLESS !== 'false',
  viewport: {
    width: parseInt(process.env.VIEWPORT_WIDTH) || 1920,
    height: parseInt(process.env.VIEWPORT_HEIGHT) || 1080
  },
  timeout: parseInt(process.env.DEFAULT_TIMEOUT) || 90000,  // Increased from 30s to 90s
  slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
  launchOptions: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',  // Hide automation detection
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions'
    ]
  },
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};
