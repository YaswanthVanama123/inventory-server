const BaseBrowser = require('../core/BaseBrowser');
const BaseNavigator = require('../core/BaseNavigator');
const BaseParser = require('../core/BaseParser');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');
const { LoginError, NavigationError } = require('../errors');





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

  


  async initialize() {
    try {
      this.logger.info('Initializing RouteStar service');

      await this.browser.launch('chromium');
      this.page = await this.browser.createPage();
      this.navigator = new BaseNavigator(this.page);

      
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

      
      await this.navigator.navigateTo(loginUrl);

      
      await this.navigator.login(credentials, selectors, successUrl);

      
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

  



  async fetchInvoices(options = {}) {
    const {
      maxPages = 10,
      stopOnEmpty = true,
      dateFrom = null,
      dateTo = null
    } = options;

    try {
      this.logger.info('Fetching invoices', { maxPages, stopOnEmpty, dateFrom, dateTo });

      
      await this.navigator.navigateTo(`${this.config.baseUrl}/invoices`);

      
      if (dateFrom || dateTo) {
        await this.applyDateFilter({ dateFrom, dateTo });
      }

      const selectors = {
        table: 'table.invoices',
        rows: 'tbody tr',
        nextButton: '.pagination-next'
      };

      
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

  



  async fetchInvoiceDetails(invoiceNumber) {
    try {
      this.logger.info('Fetching invoice details', { invoiceNumber });

      await this.navigator.navigateTo(`${this.config.baseUrl}/invoices/${invoiceNumber}`);

      const selectors = {
        invoiceInfo: '.invoice-header',
        lineItems: '.line-items table',
        totals: '.invoice-totals'
      };

      
      await this.navigator.waitForElement(selectors.invoiceInfo);

      
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

  



  async downloadInvoicePdf(invoiceNumber) {
    try {
      this.logger.info('Downloading invoice PDF', { invoiceNumber });

      await this.navigator.navigateTo(`${this.config.baseUrl}/invoices/${invoiceNumber}`);
      await this.navigator.click('.download-pdf-btn');

      
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

  


  async isLoggedIn() {
    try {
      const currentUrl = this.navigator.getUrl();
      return !currentUrl.includes('/login') && this.navigator.checkLoginStatus();
    } catch {
      return false;
    }
  }

  


  async loadCookies() {
    try {
      
      
      return null;
    } catch (error) {
      this.logger.warn('Failed to load cookies', { error: error.message });
      return null;
    }
  }

  


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
