




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

  


  async init() {
    try {
      this.logger.info('Initializing RouteStar automation');

      
      await this.browser.launch('chromium');
      this.page = await this.browser.createPage();

      
      this.baseNavigator = new BaseNavigator(this.page);

      
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
        config.routes.dashboard 
      );

      
      await this.verifyLoginSuccess();

      
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

  


  async verifyLoginSuccess() {
    this.logger.info('Verifying login success');

    
    await this.baseNavigator.wait(2000);

    
    const currentUrl = this.baseNavigator.getUrl();
    this.logger.info('Current URL after login', { currentUrl });

    if (currentUrl.includes('/web/login')) {
      await this.takeScreenshot('still-on-login-page');
      throw new LoginError('Login appears to have failed - still on login page URL');
    }

    
    const stillOnLoginPage = await this.baseNavigator.exists(selectors.login.usernameInput);
    if (stillOnLoginPage) {
      await this.takeScreenshot('login-form-still-visible');
      throw new LoginError('Login appears to have failed - login form still visible');
    }

    this.logger.info('Login verification passed');
  }

  


  async navigateToInvoices() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.navigator.navigateToInvoices();
  }

  


  async navigateToClosedInvoices() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.navigator.navigateToClosedInvoices();
  }

  


  async navigateToItems() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.navigator.navigateToItems();
  }

  




  async fetchInvoicesList(limit = Infinity, direction = 'new') {
    if (!this.isLoggedIn) {
      await this.login();
    }

    
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

  




  async fetchClosedInvoicesList(limit = Infinity, direction = 'new') {
    if (!this.isLoggedIn) {
      await this.login();
    }

    
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

  



  async fetchItemsList(limit = Infinity) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    
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

  



  async fetchInvoiceDetails(invoiceUrl) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    try {
      this.logger.info('Fetching invoice details', { invoiceUrl });

      
      await this.baseNavigator.navigateTo(invoiceUrl, {
        timeout: 90000
      });


      await this.baseNavigator.wait(2000);


      await this.baseNavigator.dismissModals();


      // Try to click the "Line Items" tab to ensure it's active
      this.logger.info('Attempting to click Line Items tab');
      try {
        const lineItemsTab = await this.page.$('a[href="#tab_line_items"]');
        if (lineItemsTab) {
          await lineItemsTab.click();
          this.logger.info('Clicked Line Items tab');
          await this.baseNavigator.wait(2000);
        } else {
          this.logger.warn('Line Items tab link not found');
        }
      } catch (error) {
        this.logger.warn('Could not click Line Items tab', { error: error.message });
      }


      try {
        await this.baseNavigator.waitForElement(selectors.invoiceDetail.itemsTable, {
          timeout: 30000
        });
        this.logger.info('Items table found');
      } catch (error) {
        this.logger.warn('Items table selector timeout - checking for modal again', { error: error.message });


        await this.baseNavigator.dismissModals();


        // Try clicking the tab again
        try {
          const lineItemsTab = await this.page.$('a[href="#tab_line_items"]');
          if (lineItemsTab) {
            await lineItemsTab.click();
            await this.baseNavigator.wait(3000);
          }
        } catch (e) {
          this.logger.warn('Could not retry clicking Line Items tab');
        }


        const tableExists = await this.baseNavigator.exists(selectors.invoiceDetail.itemsTable);
        if (!tableExists) {
          this.logger.warn('Items table still not found - taking screenshot for debugging');
          await this.takeScreenshot('items-table-not-found');
        } else {
          this.logger.info('Items table found after retry');
        }
      }


      await this.baseNavigator.wait(3000);

      this.logger.info('Extracting invoice details');

      
      const items = await this.extractLineItems();

      
      const totals = await this.extractTotals();

      
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

  


  async extractLineItems() {
    const items = [];
    const masterTable = await this.page.$('div.ht_master');

    if (!masterTable) {
      this.logger.error('Could not find invoice items table - table div not present');
      await this.takeScreenshot('table-not-found');
      return items; // Return empty array instead of throwing
    }

    const itemRows = await masterTable.$$('table.htCore tbody tr');
    this.logger.info('Found line item rows', { count: itemRows.length });

    // Debug: Log the table structure
    if (itemRows.length > 0) {
      this.logger.info('Checking first row structure');

      // Get all tbody elements to see if we have the right one
      const allTbodies = await this.page.$$('div.ht_master table.htCore tbody');
      this.logger.info('Total tbody elements found', { count: allTbodies.length });

      // Check each tbody
      for (let tbodyIdx = 0; tbodyIdx < allTbodies.length; tbodyIdx++) {
        const tbody = allTbodies[tbodyIdx];
        const rows = await tbody.$$('tr');
        this.logger.info(`Tbody ${tbodyIdx} has ${rows.length} rows`);

        // Log first row of each tbody
        if (rows.length > 0) {
          const firstRowText = await rows[0].textContent().catch(() => '[could not get text]');
          this.logger.info(`Tbody ${tbodyIdx} first row text: ${firstRowText.substring(0, 200)}`);
        }
      }
    }

    for (let i = 0; i < itemRows.length; i++) {
      const row = itemRows[i];

      try {
        // Debug: Log all cell contents for troubleshooting
        const cellTexts = await row.$$eval('td', cells =>
          cells.map((cell, idx) => ({
            index: idx + 1,
            text: cell.textContent.trim(),
            innerHTML: cell.innerHTML.substring(0, 100) // First 100 chars
          }))
        ).catch(() => []);

        this.logger.info('Row cell contents', {
          rowIndex: i + 1,
          cellCount: cellTexts.length,
          firstCellText: cellTexts[0]?.text
        });

        if (i === 0) { // Log first row details for debugging
          this.logger.debug('First row detailed cell contents', { cellTexts });
        }

        const itemName = await row.$eval(
          selectors.invoiceDetail.itemName,
          el => el.textContent.replace('▼', '').trim()
        ).catch(() => null);


        if (!itemName || itemName === 'Choose..' || itemName === '') {
          this.logger.debug('Skipping row - no valid item name', {
            rowIndex: i + 1,
            itemName,
            firstCellText: cellTexts[0]?.text
          });
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

  


  async extractAdditionalInfo() {
    const extractField = async (selector) => {
      try {
        
        
        const value = await this.page.$eval(selector, el => el.value || el.textContent || '').catch(() => '');
        return value.trim();
      } catch {
        return '';
      }
    };

    const signedBy = await extractField(selectors.invoiceDetail.signedBy);
    const invoiceMemo = await extractField(selectors.invoiceDetail.invoiceMemo);
    const serviceNotes = await extractField(selectors.invoiceDetail.serviceNotes);

    
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

module.exports = RouteStarAutomation;
