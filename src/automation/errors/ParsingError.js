const AutomationError = require('./AutomationError');




class ParsingError extends AutomationError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ParsingError';
    this.selector = options.selector;
    this.dataType = options.dataType;
    this.rawData = options.rawData;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      selector: this.selector,
      dataType: this.dataType,
      rawData: this.rawData
    };
  }
}

module.exports = ParsingError;
