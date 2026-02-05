/**
 * Automation Module Exports
 * Central export point for all automation classes
 */


const CustomerConnectAutomation = require('./customerconnect');
const RouteStarAutomation = require('./routestar');


const BaseAutomation = require('./base/BaseAutomation');


const customerConnectConfig = require('./config/customerconnect.config');
const routeStarConfig = require('./config/routestar.config');


const customerConnectSelectors = require('./selectors/customerconnect.selectors');
const routeStarSelectors = require('./selectors/routestar.selectors');


const CustomerConnectParser = require('./parsers/customerconnect.parser');
const RouteStarParser = require('./parsers/routestar.parser');


const CustomerConnectNavigator = require('./navigators/customerconnect.navigator');
const RouteStarNavigator = require('./navigators/routestar.navigator');


const CustomerConnectFetcher = require('./fetchers/CustomerConnectFetcher');
const RouteStarFetcher = require('./fetchers/RouteStarFetcher');


const RetryHandler = require('./utils/RetryHandler');
const Logger = require('./utils/Logger');

module.exports = {
  
  CustomerConnectAutomation,
  RouteStarAutomation,

  
  BaseAutomation,

  
  customerConnectConfig,
  routeStarConfig,

  
  customerConnectSelectors,
  routeStarSelectors,

  
  CustomerConnectParser,
  RouteStarParser,

  
  CustomerConnectNavigator,
  RouteStarNavigator,

  
  CustomerConnectFetcher,
  RouteStarFetcher,

  
  RetryHandler,
  Logger
};
