/**
 * Central export for all custom error classes
 */
module.exports = {
  AutomationError: require('./AutomationError'),
  LoginError: require('./LoginError'),
  NavigationError: require('./NavigationError'),
  ParsingError: require('./ParsingError'),
  ElementNotFoundError: require('./ElementNotFoundError'),
  TimeoutError: require('./TimeoutError')
};
