/**
 * RouteStar Automation
 * Refactored to use NEW core architecture with reusable base classes
 */

const BaseBrowser = require('./core/BaseBrowser');
const BaseNavigator = require('./core/BaseNavigator');
const BaseParser = require('./core/BaseParser');
const config = require('./config/routestar.config');
const selectors = require('./selectors/routestar.selectors');
const RouteStarNavigator = require('./navigators/routestar.navigator');
const RouteStarFetcher = require('./fetchers/RouteStarFetcher');
const RouteStarItemsFetcher = require('./fetchers/RouteStarItemsFetcher');
const RouteStarParser = require('./parsers/routestar.parser');
const logger = require('./utils/logger');
const { retry } = require('./utils/retry');
const { LoginError, NavigationError, ParsingError } = require('./errors');

class RouteStarAutomation {
  constructor() {
    this.config = config;
    this.selectors = selectors;
    this.browser = new BaseBrowser();
    this.baseNavigator = null;
    this.navigator = null;
    this.fetcher = null;
    this.itemsFetcher = null;
    this.page = null;
    this.isLoggedIn = false;
    this.logger = logger.child({ automation: 'RouteStar' });
  }

  /**
   * Initialize browser and components
   */
  async init() {
    try {
      this.logger.info('Initializing RouteStar automation');

      // Launch browser using new BaseBrowser
      await this.browser.launch('chromium');
      this.page = await this.browser.createPage();

      // Initialize base navigator for common operations
      this.baseNavigator = new BaseNavigator(this.page);

      // Initialize custom navigator and fetchers
      this.navigator = new RouteStarNavigator(this.page, config, selectors);
      this.fetcher = new RouteStarFetcher(this.page, this.navigator, selectors, config.baseUrl);
      this.itemsFetcher = new RouteStarItemsFetcher(this.page, this.navigator, selectors, config.baseUrl);

      this.logger.info('Initialization complete');
      return this;
    } catch (error) {
      this.logger.error('Initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Login to RouteStar portal
   */
  async login() {
    try {
      this.logger.info('Attempting login', { username: config.credentials.username });

      // Navigate to login page with retry logic
      await retry(
        async () => {
          await this.baseNavigator.navigateTo(config.baseUrl + config.routes.login);
          // Extra wait after navigation for page to stabilize
          await this.baseNavigator.wait(2000);
        },
        {
          attempts: 3,
          delay: 3000,
          backoff: true,
          onRetry: (attempt, error) => {
            this.logger.warn('Retrying navigation to login page', {
              attempt,
              error: error.message
            });
          }
        }
      );

      // Use BaseNavigator's generic login method
      await this.baseNavigator.login(
        config.credentials,
        selectors.login,
        config.routes.dashboard // Success URL check
      );

      // Verify login success
      await this.verifyLoginSuccess();

      // Save cookies for session persistence
      await this.browser.saveCookies();

      this.isLoggedIn = true;
      this.logger.info('Login successful');
      return true;
    } catch (error) {
      this.logger.error('Login failed', { error: error.message });
      await this.takeScreenshot('login-failed');
      throw new LoginError('RouteStar login failed', {
        username: config.credentials.username,
        url: config.baseUrl,
        errorMessage: error.message
      });
    }
  }

  /**
   * Verify login success by checking that login form is gone
   */
  async verifyLoginSuccess() {
    this.logger.info('Verifying login success');

    // Wait a bit for redirect after login
    await this.baseNavigator.wait(2000);

    // Check current URL - should not be on login page
    const currentUrl = this.baseNavigator.getUrl();
    this.logger.info('Current URL after login', { currentUrl });

    if (currentUrl.includes('/web/login')) {
      await this.takeScreenshot('still-on-login-page');
      throw new LoginError('Login appears to have failed - still on login page URL');
    }

    // Check if login form is still visible
    const stillOnLoginPage = await this.baseNavigator.exists(selectors.login.usernameInput);
    if (stillOnLoginPage) {
      await this.takeScreenshot('login-form-still-visible');
      throw new LoginError('Login appears to have failed - login form still visible');
    }

    this.logger.info('Login verification passed');
  }

  /**
   * Navigate to invoices page (pending invoices)
   */
  async navigateToInvoices() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.navigator.navigateToInvoices();
  }

  /**
   * Navigate to closed invoices page
   */
  async navigateToClosedInvoices() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.navigator.navigateToClosedInvoices();
  }

  /**
   * Navigate to items page
   */
  async navigateToItems() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.navigator.navigateToItems();
  }

  /**
   * Fetch list of invoices (pending) with retry logic
   * @param {number} limit - Max invoices to fetch (default: Infinity = fetch all)
   * @param {string} direction - 'new' for newest first (descending), 'old' for oldest first (ascending)
   */
  async fetchInvoicesList(limit = Infinity, direction = 'new') {
    if (!this.isLoggedIn) {
      await this.login();
    }

    // Wrap in retry logic for resilience
    return await retry(
      async () => await this.fetcher.fetchPendingInvoices(limit, direction),
      {
        attempts: 3,
        delay: 2000,
        backoff: true,
        onRetry: (attempt, error) => {
          this.logger.warn('Retry fetching invoices', { attempt, error: error.message });
        }
      }
    );
  }

  /**
   * Fetch list of closed invoices with retry logic
   * @param {number} limit - Max invoices to fetch (default: Infinity = fetch all)
   * @param {string} direction - 'new' for newest first (descending), 'old' for oldest first (ascending)
   */
  async fetchClosedInvoicesList(limit = Infinity, direction = 'new') {
    if (!this.isLoggedIn) {
      await this.login();
    }

    // Wrap in retry logic for resilience
    return await retry(
      async () => await this.fetcher.fetchClosedInvoices(limit, direction),
      {
        attempts: 3,
        delay: 2000,
        backoff: true,
        onRetry: (attempt, error) => {
          this.logger.warn('Retry fetching closed invoices', { attempt, error: error.message });
        }
      }
    );
  }

  /**
   * Fetch list of items with retry logic
   * @param {number} limit - Max items to fetch (default: Infinity = fetch all)
   */
  async fetchItemsList(limit = Infinity) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    // Wrap in retry logic for resilience
    return await retry(
      async () => await this.itemsFetcher.fetchItems(limit),
      {
        attempts: 3,
        delay: 2000,
        backoff: true,
        onRetry: (attempt, error) => {
          this.logger.warn('Retry fetching items', { attempt, error: error.message });
        }
      }
    );
  }

  /**
   * Fetch invoice details
   * @param {string} invoiceUrl - URL of the invoice detail page
   */
  async fetchInvoiceDetails(invoiceUrl) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    try {
      this.logger.info('Fetching invoice details', { invoiceUrl });

      // Navigate using updated BasePage strategy (tries load first)
      await this.baseNavigator.navigateTo(invoiceUrl, {
        timeout: 90000
      });

      // Wait a moment for any dynamic modals to appear
      await this.baseNavigator.wait(2000);

      // Dismiss any modal popups (like QuickBooks error messages)
      await this.baseNavigator.dismissModals();

      // Wait for items table to load with lenient timeout
      try {
        await this.baseNavigator.waitForElement(selectors.invoiceDetail.itemsTable, {
          timeout: 30000
        });
      } catch (error) {
        this.logger.warn('Items table selector timeout - checking for modal again', { error: error.message });

        // Modal might have reappeared - try dismissing again
        await this.baseNavigator.dismissModals();

        // Try one more time to find the table
        const tableExists = await this.baseNavigator.exists(selectors.invoiceDetail.itemsTable);
        if (!tableExists) {
          this.logger.warn('Items table still not found - will try to extract anyway');
        }
      }

      // Wait for dynamic content to load
      await this.baseNavigator.wait(3000);

      this.logger.info('Extracting invoice details');

      // Extract line items
      const items = await this.extractLineItems();

      // Extract totals
      const totals = await this.extractTotals();

      // Extract additional info
      const additionalInfo = await this.extractAdditionalInfo();

      this.logger.info('Invoice details extracted', {
        itemCount: items.length,
        subtotal: totals.subtotal,
        total: totals.total
      });

      return {
        items,
        ...totals,
        ...additionalInfo
      };
    } catch (error) {
      this.logger.error('Failed to fetch invoice details', {
        invoiceUrl,
        error: error.message
      });
      await this.takeScreenshot('fetch-invoice-details-error');
      throw new ParsingError('Failed to fetch invoice details', {
        context: { invoiceUrl },
        rawData: error.message
      });
    }
  }

  /**
   * Extract line items from invoice detail page
   */
  async extractLineItems() {
    const items = [];
    const masterTable = await this.page.$('div.ht_master');

    if (!masterTable) {
      throw new ParsingError('Could not find invoice items table');
    }

    const itemRows = await masterTable.$$('table.htCore tbody tr');
    this.logger.info('Found line item rows', { count: itemRows.length });

    for (let i = 0; i < itemRows.length; i++) {
      const row = itemRows[i];

      try {
        // Extract item name
        const itemName = await row.$eval(
          selectors.invoiceDetail.itemName,
          el => el.textContent.replace('▼', '').trim()
        ).catch(() => null);

        // Skip empty rows and placeholder rows
        if (!itemName || itemName === 'Choose..' || itemName === '') {
          continue;
        }

        const itemDescription = await row.$eval(
          selectors.invoiceDetail.itemDescription,
          el => el.textContent.trim()
        ).catch(() => '');

        const itemQuantity = await row.$eval(
          selectors.invoiceDetail.itemQuantity,
          el => parseFloat(el.textContent.trim().replace(/[^0-9.-]/g, '')) || 0
        ).catch(() => 0);

        const itemRate = await row.$eval(
          selectors.invoiceDetail.itemRate,
          el => el.textContent.replace(/[$,]/g, '').trim()
        ).catch(() => '0.00');

        const itemAmount = await row.$eval(
          selectors.invoiceDetail.itemAmount,
          el => el.textContent.replace(/[$,]/g, '').trim()
        ).catch(() => '0.00');

        const itemClass = await row.$eval(
          selectors.invoiceDetail.itemClass,
          el => el.textContent.replace('▼', '').trim()
        ).catch(() => '');

        const itemWarehouse = await row.$eval(
          selectors.invoiceDetail.itemWarehouse,
          el => el.textContent.replace('▼', '').trim()
        ).catch(() => '');

        const itemTaxCode = await row.$eval(
          selectors.invoiceDetail.itemTaxCode,
          el => el.textContent.replace('▼', '').trim()
        ).catch(() => '');

        const itemLocation = await row.$eval(
          selectors.invoiceDetail.itemLocation,
          el => el.textContent.trim()
        ).catch(() => '');

        items.push({
          name: itemName,
          description: itemDescription,
          quantity: itemQuantity,
          rate: itemRate,
          amount: itemAmount,
          class: itemClass,
          warehouse: itemWarehouse,
          taxCode: itemTaxCode,
          location: itemLocation
        });

        this.logger.debug('Extracted line item', {
          name: itemName,
          quantity: itemQuantity,
          amount: itemAmount
        });
      } catch (error) {
        this.logger.warn('Error extracting line item row', {
          rowIndex: i + 1,
          error: error.message
        });
      }
    }

    if (items.length === 0 && itemRows.length > 0) {
      this.logger.warn('No items extracted - invoice may have only placeholder rows or incomplete data', {
        rowsFound: itemRows.length
      });
    }

    return items;
  }

  /**
   * Extract totals from invoice detail page using BaseParser
   */
  async extractTotals() {
    const extractValue = async (selector) => {
      try {
        const text = await this.page.$eval(selector, el => el.value);
        return BaseParser.parseCurrency(text);
      } catch {
        return 0;
      }
    };

    const subtotal = await extractValue(selectors.invoiceDetail.subtotal);
    const tax = await extractValue(selectors.invoiceDetail.tax);
    const total = await extractValue(selectors.invoiceDetail.total);

    return { subtotal, tax, total };
  }

  /**
   * Extract additional invoice information
   */
  async extractAdditionalInfo() {
    const extractField = async (selector) => {
      try {
        // Don't wait for visibility - element might be hidden
        // Just try to get the value directly
        const value = await this.page.$eval(selector, el => el.value || el.textContent || '').catch(() => '');
        return value.trim();
      } catch {
        return '';
      }
    };

    const signedBy = await extractField(selectors.invoiceDetail.signedBy);
    const invoiceMemo = await extractField(selectors.invoiceDetail.invoiceMemo);
    const serviceNotes = await extractField(selectors.invoiceDetail.serviceNotes);

    // Get sales tax rate from dropdown
    const salesTaxRate = await this.page.$eval(
      selectors.invoiceDetail.salesTaxRate,
      el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : '';
      }
    ).catch(() => '');

    return {
      signedBy,
      invoiceMemo,
      serviceNotes,
      salesTaxRate
    };
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(name) {
    try {
      const { captureScreenshot } = require('./utils/screenshot');
      await captureScreenshot(this.page, name);
      this.logger.info('Screenshot captured', { name });
    } catch (error) {
      this.logger.warn('Failed to capture screenshot', { error: error.message });
    }
  }

  /**
   * Close browser and cleanup
   */
  async close() {
    try {
      this.logger.info('Closing browser');
      await this.browser.close();
      this.logger.info('Browser closed successfully');
    } catch (error) {
      this.logger.error('Error closing browser', { error: error.message });
      throw error;
    }
  }
}

module.exports = RouteStarAutomation;
