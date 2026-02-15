


class AutomationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AutomationError';
    this.timestamp = new Date();
    this.context = options.context || {};

    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

module.exports = AutomationError;
