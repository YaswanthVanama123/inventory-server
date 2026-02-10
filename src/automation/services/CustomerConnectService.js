const BaseBrowser = require('../core/BaseBrowser');
const BaseNavigator = require('../core/BaseNavigator');
const BaseParser = require('../core/BaseParser');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');
const { LoginError, NavigationError } = require('../errors');

/**
 * CustomerConnect automation service
 * High-level orchestration for CustomerConnect portal automation
 */
class CustomerConnectService {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || process.env.CUSTOMERCONNECT_BASE_URL,
      username: config.username || process.env.CUSTOMERCONNECT_USERNAME,
      password: config.password || process.env.CUSTOMERCONNECT_PASSWORD,
      ...config
    };

    this.browser = new BaseBrowser();
    this.navigator = null;
    this.page = null;
    this.logger = logger.child({ service: 'CustomerConnect' });
  }

  /**
   * Initialize browser and create page instance
   */
  async initialize() {
    try {
      this.logger.info('Initializing CustomerConnect service');

      await this.browser.launch('chromium');
      this.page = await this.browser.createPage();
      this.navigator = new BaseNavigator(this.page);

      // Load saved cookies if available
      const savedCookies = await this.loadCookies();
      if (savedCookies) {
        await this.browser.loadCookies(savedCookies);
        this.logger.info('Loaded saved session cookies');
      }

      this.logger.info('Service initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize service', { error: error.message });
      throw error;
    }
  }

  /**
   * Login to CustomerConnect portal
   */
  async login() {
    try {
      this.logger.info('Attempting login to CustomerConnect');

      const selectors = {
        usernameInput: '#username',
        passwordInput: '#password',
        submitButton: 'button[type="submit"]',
        errorMessage: '.error-message'
      };

      const credentials = {
        username: this.config.username,
        password: this.config.password
      };

      const loginUrl = `${this.config.baseUrl}/login`;
      const successUrl = '/orders';

      // Navigate to login page
      await this.navigator.navigateTo(loginUrl);

      // Perform login
      await this.navigator.login(credentials, selectors, successUrl);

      // Save cookies for future sessions
      await this.browser.saveCookies();

      this.logger.info('Login successful');
      return true;
    } catch (error) {
      this.logger.error('Login failed', { error: error.message });
      throw new LoginError('CustomerConnect login failed', {
        username: this.config.username,
        url: this.config.baseUrl,
        errorMessage: error.message
      });
    }
  }

  /**
   * Fetch orders from CustomerConnect
   * @param {Object} options - Fetch options
   */
  async fetchOrders(options = {}) {
    const {
      maxPages = 10,
      stopOnEmpty = true
    } = options;

    try {
      this.logger.info('Fetching orders', { maxPages, stopOnEmpty });

      // Navigate to orders page
      await this.navigator.navigateTo(`${this.config.baseUrl}/orders`);

      const selectors = {
        table: 'table.orders',
        rows: 'tbody tr',
        nextButton: '.pagination-next'
      };

      // Use pagination to fetch all orders
      const orders = await this.navigator.paginate(
        async (page) => {
          return await BaseParser.parseTableWithHeaders(page, selectors);
        },
        { nextButton: selectors.nextButton },
        { maxPages, stopOnEmpty }
      );

      this.logger.info('Orders fetched successfully', { count: orders.length });
      return orders;
    } catch (error) {
      this.logger.error('Failed to fetch orders', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch order details by order number
   * @param {string} orderNumber - Order number
   */
  async fetchOrderDetails(orderNumber) {
    try {
      this.logger.info('Fetching order details', { orderNumber });

      await this.navigator.navigateTo(`${this.config.baseUrl}/orders/${orderNumber}`);

      const selectors = {
        orderInfo: '.order-info',
        items: '.order-items table'
      };

      // Wait for order details to load
      await this.navigator.waitForElement(selectors.orderInfo);

      // Extract order information
      const orderInfo = await this.navigator.getText(selectors.orderInfo);
      const items = await BaseParser.parseTableWithHeaders(this.page, selectors);

      this.logger.info('Order details fetched', { orderNumber });
      return {
        orderNumber,
        info: orderInfo,
        items
      };
    } catch (error) {
      this.logger.error('Failed to fetch order details', {
        orderNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Search orders by criteria
   * @param {Object} filters - Search filters
   */
  async searchOrders(filters) {
    try {
      this.logger.info('Searching orders', { filters });

      await this.navigator.navigateTo(`${this.config.baseUrl}/orders`);

      const filterSelectors = {
        orderNumber: { element: '#filter-order', type: 'text' },
        dateFrom: { element: '#filter-date-from', type: 'date' },
        dateTo: { element: '#filter-date-to', type: 'date' },
        status: { element: '#filter-status', type: 'select' },
        applyButton: '#apply-filters'
      };

      // Apply filters
      await this.navigator.applyFilters(filters, filterSelectors);

      // Extract filtered results
      const results = await BaseParser.parseTableWithHeaders(this.page, {
        table: 'table.orders'
      });

      this.logger.info('Search completed', { resultsCount: results.length });
      return results;
    } catch (error) {
      this.logger.error('Search failed', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Check if currently logged in
   */
  async isLoggedIn() {
    try {
      const currentUrl = this.navigator.getUrl();
      return !currentUrl.includes('/login') && this.navigator.checkLoginStatus();
    } catch {
      return false;
    }
  }

  /**
   * Load saved cookies
   */
  async loadCookies() {
    try {
      // Implement cookie loading logic from file/database
      // This is a placeholder - implement based on your storage mechanism
      return null;
    } catch (error) {
      this.logger.warn('Failed to load cookies', { error: error.message });
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      this.logger.info('Cleaning up resources');
      await this.browser.close();
      this.logger.info('Cleanup complete');
    } catch (error) {
      this.logger.error('Cleanup failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = CustomerConnectService;
