/**
 * Logger Utility
 * Provides consistent logging across automation
 */
class Logger {
  /**
   * Log info message
   */
  static info(message, data = null) {
    console.log(`ℹ️  ${message}`, data ? data : '');
  }

  /**
   * Log success message
   */
  static success(message, data = null) {
    console.log(`✓ ${message}`, data ? data : '');
  }

  /**
   * Log error message
   */
  static error(message, error = null) {
    console.error(`✗ ${message}`, error ? error.message : '');
  }

  /**
   * Log warning message
   */
  static warn(message, data = null) {
    console.warn(`⚠️  ${message}`, data ? data : '');
  }

  /**
   * Log debug message
   */
  static debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🐛 ${message}`, data ? data : '');
    }
  }
}

module.exports = Logger;
