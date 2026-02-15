





const CustomerConnectAutomation = require('./customerconnect');
const RouteStarAutomation = require('./routestar');


const BaseBrowser = require('./core/BaseBrowser');
const BasePage = require('./core/BasePage');
const BaseNavigator = require('./core/BaseNavigator');
const BaseParser = require('./core/BaseParser');


const CustomerConnectService = require('./services/CustomerConnectService');
const RouteStarService = require('./services/RouteStarService');


const browserConfig = require('./config/browser.config');
const timeoutConfig = require('./config/timeout.config');
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


const logger = require('./utils/logger');
const { retry } = require('./utils/retry');
const { wait, waitForNetworkIdle, waitForCondition } = require('./utils/wait');
const { captureScreenshot } = require('./utils/screenshot');


const RetryHandler = require('./utils/RetryHandler');
const Logger = require('./utils/Logger');


const errors = require('./errors');

module.exports = {
  
  BaseBrowser,
  BasePage,
  BaseNavigator,
  BaseParser,

  
  CustomerConnectService,
  RouteStarService,

  
  browserConfig,
  timeoutConfig,
  customerConnectConfig,
  routeStarConfig,

  
  customerConnectSelectors,
  routeStarSelectors,

  
  CustomerConnectParser,
  RouteStarParser,

  
  CustomerConnectNavigator,
  RouteStarNavigator,

  
  logger,
  retry,
  wait,
  waitForNetworkIdle,
  waitForCondition,
  captureScreenshot,

  
  errors,

  
  CustomerConnectAutomation,
  RouteStarAutomation,
  CustomerConnectFetcher,
  RouteStarFetcher,
  RetryHandler,
  Logger
};
