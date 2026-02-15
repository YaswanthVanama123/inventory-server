




const BaseBrowser = require('./core/BaseBrowser');
const BaseNavigator = require('./core/BaseNavigator');
const BaseParser = require('./core/BaseParser');
const config = require('./config/customerconnect.config');
const selectors = require('./selectors/customerconnect.selectors');
const CustomerConnectNavigator = require('./navigators/customerconnect.navigator');
const CustomerConnectFetcher = require('./fetchers/CustomerConnectFetcher');
const CustomerConnectParser = require('./parsers/customerconnect.parser');
const logger = require('./utils/logger');
const { retry } = require('./utils/retry');
const { LoginError, NavigationError, ParsingError } = require('./errors');

class CustomerConnectAutomation {
  constructor() {
    this.config = config;
    this.selectors = selectors;
    this.browser = new BaseBrowser();
    this.baseNavigator = null;
    this.navigator = null;
    this.fetcher = null;
    this.page = null;
    this.isLoggedIn = false;
    this.logger = logger.child({ automation: 'CustomerConnect' });
  }

  


  async init() {
    try {
      this.logger.info('Initializing CustomerConnect automation');

      
      await this.browser.launch('chromium');
      this.page = await this.browser.createPage();

      
      this.baseNavigator = new BaseNavigator(this.page);

      
      this.navigator = new CustomerConnectNavigator(this.page, config, selectors);
      this.fetcher = new CustomerConnectFetcher(this.page, this.navigator, selectors);

      this.logger.info('Initialization complete');
      return this;
    } catch (error) {
      this.logger.error('Initialization failed', { error: error.message });
      throw error;
    }
  }

  


  async login() {
    try {
      this.logger.info('Attempting login', { username: config.credentials.username });

      
      await retry(
        async () => {
          await this.baseNavigator.navigateTo(config.baseUrl + config.routes.login);
          
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

      
      await this.baseNavigator.login(
        config.credentials,
        selectors.login,
        config.routes.account 
      );

      
      await this.verifyLoginSuccess();

      
      await this.browser.saveCookies();

      this.isLoggedIn = true;
      this.logger.info('Login successful');
      return true;
    } catch (error) {
      this.logger.error('Login failed', { error: error.message });
      await this.takeScreenshot('login-failed');
      throw new LoginError('CustomerConnect login failed', {
        username: config.credentials.username,
        url: config.baseUrl,
        errorMessage: error.message
      });
    }
  }

  


  async verifyLoginSuccess() {
    try {
      await this.baseNavigator.waitForElement(selectors.login.loggedInIndicator, {
        timeout: 10000
      });
    } catch (error) {
      
      const stillOnLoginPage = await this.baseNavigator.exists(selectors.login.usernameInput);
      if (stillOnLoginPage) {
        throw new LoginError('Login appears to have failed - still on login page');
      }
    }
  }

  


  async navigateToOrders() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.navigator.navigateToOrders();
  }

  


  async getPaginationInfo() {
    return await this.navigator.getPaginationInfo();
  }

  



  async fetchOrdersList(limit = Infinity) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    
    return await retry(
      async () => await this.fetcher.fetchOrders(limit),
      {
        attempts: 3,
        delay: 2000,
        backoff: true,
        onRetry: (attempt, error) => {
          this.logger.warn('Retry fetching orders', { attempt, error: error.message });
        }
      }
    );
  }

  



  async fetchOrderDetails(orderUrl) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    try {
      this.logger.info('Fetching order details', { orderUrl });

      
      
      await this.baseNavigator.navigateTo(orderUrl);
      await this.baseNavigator.waitForNetwork();
      await this.baseNavigator.wait(1000);

      
      const orderDetailsText = await this.baseNavigator.getText('table.list tbody tr td.left');

      
      const orderNumber = CustomerConnectParser.extractOrderNumber(orderDetailsText);
      const poNumber = CustomerConnectParser.extractPONumberFromDetails(orderDetailsText);
      const orderDate = CustomerConnectParser.extractDate(orderDetailsText);
      const vendorName = CustomerConnectParser.extractVendorFromDetails(orderDetailsText);

      
      let orderStatus = 'Unknown';
      try {
        
        if (await this.baseNavigator.exists('table.list:last-child tbody tr td:nth-child(2)')) {
          orderStatus = await this.baseNavigator.getText('table.list:last-child tbody tr td:nth-child(2)', {
            timeout: 5000
          });
        }
      } catch (error) {
        
        try {
          const statusText = await this.page.$eval(
            'table.list tbody tr:has-text("Status") td:last-child',
            el => el.textContent
          ).catch(() => null);
          if (statusText) orderStatus = statusText.trim();
        } catch {
          orderStatus = 'Unknown';
        }
      }

      
      const items = await this.extractLineItems();

      
      const totals = await this.extractTotals();

      const orderData = {
        orderNumber,
        poNumber,
        orderDate,
        status: orderStatus?.trim() || '',
        vendor: {
          name: vendorName || '',
          email: '',
          phone: ''
        },
        items,
        ...totals
      };

      this.logger.info('Order details extracted', {
        orderNumber,
        itemCount: items.length
      });

      return orderData;
    } catch (error) {
      this.logger.error('Failed to fetch order details', {
        orderUrl,
        error: error.message
      });
      await this.takeScreenshot('fetch-order-details-error');
      throw new ParsingError('Failed to fetch order details', {
        context: { orderUrl },
        rawData: error.message
      });
    }
  }

  


  async extractLineItems() {
    const items = [];

    
    const tableSelector = 'table.list:nth-of-type(3)';

    
    const rows = await this.page.$$(`${tableSelector} tbody tr`);

    for (const row of rows) {
      try {
        const cells = await row.$$('td');
        if (cells.length >= 5) {
          const itemName = await cells[0].textContent().then(t => t.trim()).catch(() => '');
          const itemSKU = await cells[1].textContent().then(t => t.trim()).catch(() => '');
          const itemQuantity = await cells[2].textContent()
            .then(t => parseFloat(t.trim()))
            .catch(() => 0);
          const itemPrice = await cells[3].textContent()
            .then(t => BaseParser.parseCurrency(t))
            .catch(() => 0);
          const itemTotal = await cells[4].textContent()
            .then(t => BaseParser.parseCurrency(t))
            .catch(() => 0);

          if (itemName) {
            items.push({
              name: itemName,
              sku: itemSKU,
              qty: itemQuantity,
              unitPrice: itemPrice,
              lineTotal: itemTotal
            });
          }
        }
      } catch (error) {
        this.logger.warn('Error extracting item row', { error: error.message });
      }
    }

    return items;
  }

  


  async extractTotals() {
    const extractTotal = async (labelText) => {
      try {
        const text = await this.page.$eval(
          `table.list:nth-of-type(3) tfoot tr:has-text("${labelText}") td.right:last-child`,
          el => el.textContent
        );
        return BaseParser.parseCurrency(text);
      } catch {
        return 0;
      }
    };

    const subtotal = await extractTotal('Sub-Total');
    const tax = await extractTotal('Tax');
    const shipping = await extractTotal('Shipping');
    const total = await extractTotal('Total');

    return { subtotal, tax, shipping, total };
  }

  


  async takeScreenshot(name) {
    try {
      const { captureScreenshot } = require('./utils/screenshot');
      await captureScreenshot(this.page, name);
      this.logger.info('Screenshot captured', { name });
    } catch (error) {
      this.logger.warn('Failed to capture screenshot', { error: error.message });
    }
  }

  


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

module.exports = CustomerConnectAutomation;
