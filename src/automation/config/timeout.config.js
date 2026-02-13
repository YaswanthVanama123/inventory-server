module.exports = {
  // Page navigation timeout (increased from 30s to 90s for slow loading pages)
  navigation: parseInt(process.env.NAVIGATION_TIMEOUT) || 90000,

  // Element wait timeout (increased from 10s to 20s)
  element: parseInt(process.env.ELEMENT_TIMEOUT) || 20000,

  // Network idle timeout (increased from 15s to 30s)
  network: parseInt(process.env.NETWORK_TIMEOUT) || 30000,

  // Screenshot timeout (increased from 5s to 15s)
  screenshot: parseInt(process.env.SCREENSHOT_TIMEOUT) || 15000,

  // Retry configuration
  retry: {
    attempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
    delay: parseInt(process.env.RETRY_DELAY) || 2000,
    backoff: process.env.RETRY_BACKOFF !== 'false' // Exponential backoff (default true)
  }
};
