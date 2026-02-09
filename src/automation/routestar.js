/**
 * RouteStar Automation
 * Refactored to use professional architecture with reusable components
 */

const BaseAutomation = require('./base/BaseAutomation');
const config = require('./config/routestar.config');
const selectors = require('./selectors/routestar.selectors');
const RouteStarNavigator = require('./navigators/routestar.navigator');
const RouteStarFetcher = require('./fetchers/RouteStarFetcher');
const RouteStarParser = require('./parsers/routestar.parser');

class RouteStarAutomation extends BaseAutomation {
  constructor() {
    super(config);
    this.selectors = selectors;
    this.navigator = null;
    this.fetcher = null;
  }

  /**
   * Initialize browser and components
   */
  async init() {
    await super.init();

    
    this.navigator = new RouteStarNavigator(this.page, config, selectors);
    this.fetcher = new RouteStarFetcher(this.page, this.navigator, selectors, config.baseUrl);

    return this;
  }

  /**
   * Verify login success by checking that login form is gone
   */
  async verifyLoginSuccess() {
    console.log('Verifying login success...');

    // Wait a bit for redirect after login
    await this.page.waitForTimeout(2000);

    // Check current URL - should not be on login page
    const currentUrl = this.page.url();
    console.log(`Current URL after login: ${currentUrl}`);

    if (currentUrl.includes('/web/login')) {
      // Take screenshot for debugging
      await this.takeScreenshot('still-on-login-page');
      throw new Error('Login appears to have failed - still on login page URL');
    }

    // Check if login form is still visible
    const stillOnLoginPage = await this.page.$(this.selectors.login.usernameInput);
    if (stillOnLoginPage) {
      const isVisible = await this.page.isVisible(this.selectors.login.usernameInput);
      if (isVisible) {
        await this.takeScreenshot('login-form-still-visible');
        throw new Error('Login appears to have failed - login form still visible');
      }
    }

    console.log('✓ Login verification passed');
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
   * Fetch list of invoices (pending)
   * @param {number} limit - Max invoices to fetch (default: Infinity = fetch all)
   * @param {string} direction - 'new' for newest first (descending), 'old' for oldest first (ascending)
   */
  async fetchInvoicesList(limit = Infinity, direction = 'new') {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.fetcher.fetchPendingInvoices(limit, direction);
  }

  /**
   * Fetch list of closed invoices
   * @param {number} limit - Max invoices to fetch (default: Infinity = fetch all)
   * @param {string} direction - 'new' for newest first (descending), 'old' for oldest first (ascending)
   */
  async fetchClosedInvoicesList(limit = Infinity, direction = 'new') {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.fetcher.fetchClosedInvoices(limit, direction);
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
      console.log(`Navigating to invoice details: ${invoiceUrl}`);
      await this.page.goto(invoiceUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      
      await this.page.waitForSelector(this.selectors.invoiceDetail.itemsTable, {
        timeout: 30000,
        state: 'visible'
      });

      
      await this.page.waitForTimeout(3000);

      console.log('Extracting invoice details...');

      
      const items = await this.extractLineItems();

      
      const totals = await this.extractTotals();

      
      const additionalInfo = await this.extractAdditionalInfo();

      console.log(`✓ Extracted ${items.length} line items`);
      console.log(`  Subtotal: $${totals.subtotal}, Tax: $${totals.tax}, Total: $${totals.total}`);

      return {
        items,
        ...totals,
        ...additionalInfo
      };
    } catch (error) {
      console.error('Fetch invoice details error:', error.message);
      await this.takeScreenshot('fetch-invoice-details-error');
      throw new Error(`Failed to fetch invoice details: ${error.message}`);
    }
  }

  /**
   * Extract line items from invoice detail page
   */
  async extractLineItems() {
    const items = [];
    const masterTable = await this.page.$('div.ht_master');

    if (!masterTable) {
      throw new Error('Could not find invoice items table');
    }

    const itemRows = await masterTable.$$('table.htCore tbody tr');
    console.log(`Found ${itemRows.length} line item rows`);

    for (let i = 0; i < itemRows.length; i++) {
      const row = itemRows[i];

      try {
        
        const itemName = await row.$eval(
          this.selectors.invoiceDetail.itemName,
          el => el.textContent.replace('▼', '').trim()
        ).catch(() => null);

        
        if (!itemName || itemName === 'Choose..') {
          continue;
        }

        const itemDescription = await row.$eval(
          this.selectors.invoiceDetail.itemDescription,
          el => el.textContent.trim()
        ).catch(() => '');

        const itemQuantity = await row.$eval(
          this.selectors.invoiceDetail.itemQuantity,
          el => parseFloat(el.textContent.trim().replace(/[^0-9.-]/g, '')) || 0
        ).catch(() => 0);

        const itemRate = await row.$eval(
          this.selectors.invoiceDetail.itemRate,
          el => el.textContent.replace(/[$,]/g, '').trim()
        ).catch(() => '0.00');

        const itemAmount = await row.$eval(
          this.selectors.invoiceDetail.itemAmount,
          el => el.textContent.replace(/[$,]/g, '').trim()
        ).catch(() => '0.00');

        const itemClass = await row.$eval(
          this.selectors.invoiceDetail.itemClass,
          el => el.textContent.replace('▼', '').trim()
        ).catch(() => '');

        const itemWarehouse = await row.$eval(
          this.selectors.invoiceDetail.itemWarehouse,
          el => el.textContent.replace('▼', '').trim()
        ).catch(() => '');

        const itemTaxCode = await row.$eval(
          this.selectors.invoiceDetail.itemTaxCode,
          el => el.textContent.replace('▼', '').trim()
        ).catch(() => '');

        const itemLocation = await row.$eval(
          this.selectors.invoiceDetail.itemLocation,
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

        console.log(`  ✓ Extracted item: ${itemName} - Qty: ${itemQuantity} - Amount: $${itemAmount}`);
      } catch (error) {
        console.warn(`  ⚠ Error extracting line item row ${i + 1}:`, error.message);
      }
    }

    return items;
  }

  /**
   * Extract totals from invoice detail page
   */
  async extractTotals() {
    const subtotal = await this.page.$eval(
      this.selectors.invoiceDetail.subtotal,
      el => el.value.replace(/[$,]/g, '').trim()
    ).catch(() => '0.00');

    const tax = await this.page.$eval(
      this.selectors.invoiceDetail.tax,
      el => el.value.replace(/[$,]/g, '').trim()
    ).catch(() => '0.00');

    const total = await this.page.$eval(
      this.selectors.invoiceDetail.total,
      el => el.value.replace(/[$,]/g, '').trim()
    ).catch(() => '0.00');

    return { subtotal, tax, total };
  }

  /**
   * Extract additional invoice information
   */
  async extractAdditionalInfo() {
    const signedBy = await this.page.$eval(
      this.selectors.invoiceDetail.signedBy,
      el => el.value.trim()
    ).catch(() => '');

    const invoiceMemo = await this.page.$eval(
      this.selectors.invoiceDetail.invoiceMemo,
      el => el.value.trim()
    ).catch(() => '');

    const serviceNotes = await this.page.$eval(
      this.selectors.invoiceDetail.serviceNotes,
      el => el.value.trim()
    ).catch(() => '');

    const salesTaxRate = await this.page.$eval(
      this.selectors.invoiceDetail.salesTaxRate,
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
}

module.exports = RouteStarAutomation;
