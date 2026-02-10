const AutomationError = require('./AutomationError');

/**
 * Timeout error
 */
class TimeoutError extends AutomationError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'TimeoutError';
    this.timeout = options.timeout;
    this.operation = options.operation;
    this.url = options.url;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      timeout: this.timeout,
      operation: this.operation,
      url: this.url
    };
  }
}

module.exports = TimeoutError;
