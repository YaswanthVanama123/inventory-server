const AutomationError = require('./AutomationError');

/**
 * Navigation-specific error
 */
class NavigationError extends AutomationError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'NavigationError';
    this.url = options.url;
    this.expectedUrl = options.expectedUrl;
    this.actualUrl = options.actualUrl;
    this.timeout = options.timeout;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      url: this.url,
      expectedUrl: this.expectedUrl,
      actualUrl: this.actualUrl,
      timeout: this.timeout
    };
  }
}

module.exports = NavigationError;
