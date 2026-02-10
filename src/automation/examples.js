/**
 * Example usage of the automation framework
 * This file demonstrates how to use the CustomerConnect and RouteStar services
 */

const CustomerConnectService = require('./services/CustomerConnectService');
const RouteStarService = require('./services/RouteStarService');
const { retry } = require('./utils/retry');
const logger = require('./utils/logger');

/**
 * Example 1: Basic usage - Fetch CustomerConnect orders
 */
async function fetchCustomerConnectOrders() {
  const service = new CustomerConnectService();

  try {
    // Initialize browser
    await service.initialize();

    // Login
    await service.login();

    // Fetch orders
    const orders = await service.fetchOrders({
      maxPages: 5,
      stopOnEmpty: true
    });

    logger.info('Fetched orders', { count: orders.length });
    console.log(orders);

    return orders;
  } catch (error) {
    logger.error('Failed to fetch orders', { error: error.message });
    throw error;
  } finally {
    // Always cleanup
    await service.cleanup();
  }
}

/**
 * Example 2: Using retry logic
 */
async function fetchOrdersWithRetry() {
  const service = new CustomerConnectService();

  try {
    await service.initialize();
    await service.login();

    // Wrap the fetch operation in retry logic
    const orders = await retry(
      async () => await service.fetchOrders(),
      {
        attempts: 3,
        delay: 2000,
        backoff: true,
        onRetry: (attempt, error) => {
          logger.warn(`Retry attempt ${attempt}`, { error: error.message });
        }
      }
    );

    return orders;
  } catch (error) {
    logger.error('All retry attempts failed', { error: error.message });
    throw error;
  } finally {
    await service.cleanup();
  }
}

/**
 * Example 3: Fetch RouteStar invoices with date filter
 */
async function fetchRouteStarInvoices() {
  const service = new RouteStarService();

  try {
    await service.initialize();
    await service.login();

    // Fetch invoices with date range
    const invoices = await service.fetchInvoices({
      maxPages: 10,
      stopOnEmpty: true,
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31'
    });

    logger.info('Fetched invoices', { count: invoices.length });
    return invoices;
  } catch (error) {
    logger.error('Failed to fetch invoices', { error: error.message });
    throw error;
  } finally {
    await service.cleanup();
  }
}

/**
 * Example 4: Fetch specific order details
 */
async function fetchOrderDetails(orderNumber) {
  const service = new CustomerConnectService();

  try {
    await service.initialize();
    await service.login();

    const details = await service.fetchOrderDetails(orderNumber);

    logger.info('Order details fetched', { orderNumber });
    console.log(details);

    return details;
  } catch (error) {
    logger.error('Failed to fetch order details', {
      orderNumber,
      error: error.message
    });
    throw error;
  } finally {
    await service.cleanup();
  }
}

/**
 * Example 5: Search orders with filters
 */
async function searchOrders() {
  const service = new CustomerConnectService();

  try {
    await service.initialize();
    await service.login();

    const results = await service.searchOrders({
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      status: 'completed'
    });

    logger.info('Search results', { count: results.length });
    return results;
  } catch (error) {
    logger.error('Search failed', { error: error.message });
    throw error;
  } finally {
    await service.cleanup();
  }
}

/**
 * Example 6: Parallel execution - Fetch from both portals simultaneously
 */
async function fetchFromBothPortals() {
  try {
    const [orders, invoices] = await Promise.all([
      fetchCustomerConnectOrders(),
      fetchRouteStarInvoices()
    ]);

    logger.info('Fetched from both portals', {
      ordersCount: orders.length,
      invoicesCount: invoices.length
    });

    return { orders, invoices };
  } catch (error) {
    logger.error('Parallel fetch failed', { error: error.message });
    throw error;
  }
}

/**
 * Example 7: Error handling with custom errors
 */
async function fetchWithErrorHandling() {
  const { LoginError, NavigationError } = require('./errors');
  const service = new CustomerConnectService();

  try {
    await service.initialize();
    await service.login();
    const orders = await service.fetchOrders();
    return orders;
  } catch (error) {
    if (error instanceof LoginError) {
      logger.error('Login failed', {
        username: error.username,
        url: error.url,
        message: error.errorMessage
      });
      // Handle login failure specifically
    } else if (error instanceof NavigationError) {
      logger.error('Navigation failed', {
        url: error.url,
        expectedUrl: error.expectedUrl,
        actualUrl: error.actualUrl
      });
      // Handle navigation failure specifically
    } else {
      logger.error('Unknown error', { error: error.message });
    }
    throw error;
  } finally {
    await service.cleanup();
  }
}

/**
 * Example 8: Using core components directly
 */
async function useCoreDirect() {
  const BaseBrowser = require('./core/BaseBrowser');
  const BaseNavigator = require('./core/BaseNavigator');
  const BaseParser = require('./core/BaseParser');

  const browser = new BaseBrowser();

  try {
    // Initialize browser
    await browser.launch('chromium');
    const page = await browser.createPage();
    const navigator = new BaseNavigator(page);

    // Navigate and login
    await navigator.navigateTo('https://example.com/login');
    await navigator.login(
      { username: 'user', password: 'pass' },
      {
        usernameInput: '#username',
        passwordInput: '#password',
        submitButton: 'button[type="submit"]'
      },
      '/dashboard'
    );

    // Extract data
    const data = await BaseParser.parseTableWithHeaders(page, {
      table: 'table.data'
    });

    console.log(data);
    return data;
  } catch (error) {
    logger.error('Direct core usage failed', { error: error.message });
    throw error;
  } finally {
    await browser.close();
  }
}

// Export examples
module.exports = {
  fetchCustomerConnectOrders,
  fetchOrdersWithRetry,
  fetchRouteStarInvoices,
  fetchOrderDetails,
  searchOrders,
  fetchFromBothPortals,
  fetchWithErrorHandling,
  useCoreDirect
};

// Run example if executed directly
if (require.main === module) {
  (async () => {
    try {
      // Run any example here
      await fetchCustomerConnectOrders();
    } catch (error) {
      console.error('Example failed:', error.message);
      process.exit(1);
    }
  })();
}
