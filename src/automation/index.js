/**
 * Automation Module Exports
 * Central export point for all automation classes
 */

// Legacy automations (kept for backward compatibility)
const CustomerConnectAutomation = require('./customerconnect');
const RouteStarAutomation = require('./routestar');

// Core base classes (NEW ARCHITECTURE)
const BaseBrowser = require('./core/BaseBrowser');
const BasePage = require('./core/BasePage');
const BaseNavigator = require('./core/BaseNavigator');
const BaseParser = require('./core/BaseParser');

// Services (HIGH-LEVEL ORCHESTRATION)
const CustomerConnectService = require('./services/CustomerConnectService');
const RouteStarService = require('./services/RouteStarService');

// Configuration
const browserConfig = require('./config/browser.config');
const timeoutConfig = require('./config/timeout.config');
const customerConnectConfig = require('./config/customerconnect.config');
const routeStarConfig = require('./config/routestar.config');

// Selectors
const customerConnectSelectors = require('./selectors/customerconnect.selectors');
const routeStarSelectors = require('./selectors/routestar.selectors');

// Parsers
const CustomerConnectParser = require('./parsers/customerconnect.parser');
const RouteStarParser = require('./parsers/routestar.parser');

// Navigators
const CustomerConnectNavigator = require('./navigators/customerconnect.navigator');
const RouteStarNavigator = require('./navigators/routestar.navigator');

// Fetchers (legacy)
const CustomerConnectFetcher = require('./fetchers/CustomerConnectFetcher');
const RouteStarFetcher = require('./fetchers/RouteStarFetcher');

// Utilities
const logger = require('./utils/logger');
const { retry } = require('./utils/retry');
const { wait, waitForNetworkIdle, waitForCondition } = require('./utils/wait');
const { captureScreenshot } = require('./utils/screenshot');

// Legacy utilities (kept for backward compatibility)
const RetryHandler = require('./utils/RetryHandler');
const Logger = require('./utils/Logger');

// Custom errors
const errors = require('./errors');

module.exports = {
  // Core classes (RECOMMENDED FOR NEW CODE)
  BaseBrowser,
  BasePage,
  BaseNavigator,
  BaseParser,

  // Services (RECOMMENDED FOR NEW CODE)
  CustomerConnectService,
  RouteStarService,

  // Configuration
  browserConfig,
  timeoutConfig,
  customerConnectConfig,
  routeStarConfig,

  // Selectors
  customerConnectSelectors,
  routeStarSelectors,

  // Parsers
  CustomerConnectParser,
  RouteStarParser,

  // Navigators
  CustomerConnectNavigator,
  RouteStarNavigator,

  // Utilities
  logger,
  retry,
  wait,
  waitForNetworkIdle,
  waitForCondition,
  captureScreenshot,

  // Custom errors
  errors,

  // Legacy exports (backward compatibility)
  CustomerConnectAutomation,
  RouteStarAutomation,
  CustomerConnectFetcher,
  RouteStarFetcher,
  RetryHandler,
  Logger
};
