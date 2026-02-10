module.exports = {
  // Page navigation timeout
  navigation: parseInt(process.env.NAVIGATION_TIMEOUT) || 30000,
  
  // Element wait timeout
  element: parseInt(process.env.ELEMENT_TIMEOUT) || 10000,
  
  // Network idle timeout
  network: parseInt(process.env.NETWORK_TIMEOUT) || 15000,
  
  // Screenshot timeout
  screenshot: parseInt(process.env.SCREENSHOT_TIMEOUT) || 5000,
  
  // Retry configuration
  retry: {
    attempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
    delay: parseInt(process.env.RETRY_DELAY) || 2000,
    backoff: process.env.RETRY_BACKOFF === 'true' // Exponential backoff
  }
};
