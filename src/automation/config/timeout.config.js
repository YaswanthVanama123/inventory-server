module.exports = {
  navigation: parseInt(process.env.NAVIGATION_TIMEOUT) || 90000,

  element: parseInt(process.env.ELEMENT_TIMEOUT) || 20000,

  network: parseInt(process.env.NETWORK_TIMEOUT) || 30000,

  screenshot: parseInt(process.env.SCREENSHOT_TIMEOUT) || 15000,

  retry: {
    attempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
    delay: parseInt(process.env.RETRY_DELAY) || 2000,
    backoff: process.env.RETRY_BACKOFF !== 'false'
  }
};
