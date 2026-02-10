const BaseBrowser = require('../core/BaseBrowser');
const BaseNavigator = require('../core/BaseNavigator');
const BaseParser = require('../core/BaseParser');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');
const { LoginError, NavigationError } = require('../errors');

/**
 * RouteStar automation service
 * High-level orchestration for RouteStar portal automation
 */
class RouteStarService {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || process.env.ROUTESTAR_BASE_URL,
      username: config.username || process.env.ROUTESTAR_USERNAME,
      password: config.password || process.env.ROUTESTAR_PASSWORD,
      ...config
    };

    this.browser = new BaseBrowser();
    this.navigator = null;
    this.page = null;
    this.logger = logger.child({ service: 'RouteStar' });
  }

  /**
   * Initialize browser and create page instance
   */
  async initialize() {
    try {
      this.logger.info('Initializing RouteStar service');

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
   * Login to RouteStar portal
   */
  async login() {
    try {
      this.logger.info('Attempting login to RouteStar');

      const selectors = {
        usernameInput: '#login',
        passwordInput: '#password',
        submitButton: 'button.login-btn',
        errorMessage: '.login-error'
      };

      const credentials = {
        username: this.config.username,
        password: this.config.password
      };

      const loginUrl = `${this.config.baseUrl}/login`;
      const successUrl = '/dashboard';

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
      throw new LoginError('RouteStar login failed', {
        username: this.config.username,
        url: this.config.baseUrl,
        errorMessage: error.message
      });
    }
  }

  /**
   * Fetch invoices from RouteStar
   * @param {Object} options - Fetch options
   */
  async fetchInvoices(options = {}) {
    const {
      maxPages = 10,
      stopOnEmpty = true,
      dateFrom = null,
      dateTo = null
    } = options;

    try {
      this.logger.info('Fetching invoices', { maxPages, stopOnEmpty, dateFrom, dateTo });

      // Navigate to invoices page
      await this.navigator.navigateTo(`${this.config.baseUrl}/invoices`);

      // Apply date filters if provided
      if (dateFrom || dateTo) {
        await this.applyDateFilter({ dateFrom, dateTo });
      }

      const selectors = {
        table: 'table.invoices',
        rows: 'tbody tr',
        nextButton: '.pagination-next'
      };

      // Use pagination to fetch all invoices
      const invoices = await this.navigator.paginate(
        async (page) => {
          return await BaseParser.parseTableWithHeaders(page, selectors);
        },
        { nextButton: selectors.nextButton },
        { maxPages, stopOnEmpty }
      );

      this.logger.info('Invoices fetched successfully', { count: invoices.length });
      return invoices;
    } catch (error) {
      this.logger.error('Failed to fetch invoices', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch invoice details by invoice number
   * @param {string} invoiceNumber - Invoice number
   */
  async fetchInvoiceDetails(invoiceNumber) {
    try {
      this.logger.info('Fetching invoice details', { invoiceNumber });

      await this.navigator.navigateTo(`${this.config.baseUrl}/invoices/${invoiceNumber}`);

      const selectors = {
        invoiceInfo: '.invoice-header',
        lineItems: '.line-items table',
        totals: '.invoice-totals'
      };

      // Wait for invoice details to load
      await this.navigator.waitForElement(selectors.invoiceInfo);

      // Extract invoice information
      const invoiceInfo = await this.navigator.getText(selectors.invoiceInfo);
      const lineItems = await BaseParser.parseTableWithHeaders(this.page, selectors.lineItems);
      const totals = await this.navigator.getText(selectors.totals);

      this.logger.info('Invoice details fetched', { invoiceNumber });
      return {
        invoiceNumber,
        info: invoiceInfo,
        lineItems,
        totals
      };
    } catch (error) {
      this.logger.error('Failed to fetch invoice details', {
        invoiceNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Apply date filter to invoice search
   * @param {Object} dateFilter - Date filter options
   */
  async applyDateFilter(dateFilter) {
    try {
      const filterSelectors = {
        dateFrom: { element: '#date-from', type: 'date' },
        dateTo: { element: '#date-to', type: 'date' },
        applyButton: '#apply-filter'
      };

      await this.navigator.applyFilters(dateFilter, filterSelectors);
      this.logger.info('Date filter applied', { dateFilter });
    } catch (error) {
      this.logger.error('Failed to apply date filter', { error: error.message });
      throw error;
    }
  }

  /**
   * Download invoice PDF
   * @param {string} invoiceNumber - Invoice number
   */
  async downloadInvoicePdf(invoiceNumber) {
    try {
      this.logger.info('Downloading invoice PDF', { invoiceNumber });

      await this.navigator.navigateTo(`${this.config.baseUrl}/invoices/${invoiceNumber}`);
      await this.navigator.click('.download-pdf-btn');

      // Wait for download to start
      await this.navigator.wait(2000);

      this.logger.info('Invoice PDF download initiated', { invoiceNumber });
      return true;
    } catch (error) {
      this.logger.error('Failed to download invoice PDF', {
        invoiceNumber,
        error: error.message
      });
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

module.exports = RouteStarService;
