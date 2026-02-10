const AutomationError = require('./AutomationError');

/**
 * Login-specific error
 */
class LoginError extends AutomationError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'LoginError';
    this.username = options.username;
    this.url = options.url;
    this.errorMessage = options.errorMessage;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      username: this.username,
      url: this.url,
      errorMessage: this.errorMessage
    };
  }
}

module.exports = LoginError;
