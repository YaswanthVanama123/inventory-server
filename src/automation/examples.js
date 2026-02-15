




const CustomerConnectService = require('./services/CustomerConnectService');
const RouteStarService = require('./services/RouteStarService');
const { retry } = require('./utils/retry');
const logger = require('./utils/logger');




async function fetchCustomerConnectOrders() {
  const service = new CustomerConnectService();

  try {
    
    await service.initialize();

    
    await service.login();

    
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
    
    await service.cleanup();
  }
}




async function fetchOrdersWithRetry() {
  const service = new CustomerConnectService();

  try {
    await service.initialize();
    await service.login();

    
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




async function fetchRouteStarInvoices() {
  const service = new RouteStarService();

  try {
    await service.initialize();
    await service.login();

    
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
      
    } else if (error instanceof NavigationError) {
      logger.error('Navigation failed', {
        url: error.url,
        expectedUrl: error.expectedUrl,
        actualUrl: error.actualUrl
      });
      
    } else {
      logger.error('Unknown error', { error: error.message });
    }
    throw error;
  } finally {
    await service.cleanup();
  }
}




async function useCoreDirect() {
  const BaseBrowser = require('./core/BaseBrowser');
  const BaseNavigator = require('./core/BaseNavigator');
  const BaseParser = require('./core/BaseParser');

  const browser = new BaseBrowser();

  try {
    
    await browser.launch('chromium');
    const page = await browser.createPage();
    const navigator = new BaseNavigator(page);

    
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


if (require.main === module) {
  (async () => {
    try {
      
      await fetchCustomerConnectOrders();
    } catch (error) {
      console.error('Example failed:', error.message);
      process.exit(1);
    }
  })();
}
