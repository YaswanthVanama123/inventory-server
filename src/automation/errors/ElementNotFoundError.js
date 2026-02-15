const AutomationError = require('./AutomationError');




class ElementNotFoundError extends AutomationError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ElementNotFoundError';
    this.selector = options.selector;
    this.timeout = options.timeout;
    this.url = options.url;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      selector: this.selector,
      timeout: this.timeout,
      url: this.url
    };
  }
}

module.exports = ElementNotFoundError;
