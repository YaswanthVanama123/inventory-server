/**
 * CustomerConnect Automation
 * Refactored to use professional architecture with reusable components
 */

const BaseAutomation = require('./base/BaseAutomation');
const config = require('./config/customerconnect.config');
const selectors = require('./selectors/customerconnect.selectors');
const CustomerConnectNavigator = require('./navigators/customerconnect.navigator');
const CustomerConnectFetcher = require('./fetchers/CustomerConnectFetcher');
const CustomerConnectParser = require('./parsers/customerconnect.parser');

class CustomerConnectAutomation extends BaseAutomation {
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

    
    this.navigator = new CustomerConnectNavigator(this.page, config, selectors);
    this.fetcher = new CustomerConnectFetcher(this.page, this.navigator, selectors);

    return this;
  }

  /**
   * Verify login success by checking for logged-in indicator
   */
  async verifyLoginSuccess() {
    try {
      await this.page.waitForSelector(this.selectors.login.loggedInIndicator, {
        timeout: 10000,
        state: 'visible'
      });
    } catch (error) {
      
      const stillOnLoginPage = await this.page.$(this.selectors.login.usernameInput);
      if (stillOnLoginPage) {
        throw new Error('Login appears to have failed - still on login page');
      }
    }
  }

  /**
   * Navigate to orders page
   */
  async navigateToOrders() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.navigator.navigateToOrders();
  }

  /**
   * Get pagination information
   */
  async getPaginationInfo() {
    return await this.navigator.getPaginationInfo();
  }

  /**
   * Fetch list of orders
   * @param {number} limit - Max orders to fetch (default: Infinity = fetch all)
   */
  async fetchOrdersList(limit = Infinity) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    return await this.fetcher.fetchOrders(limit);
  }

  /**
   * Fetch order details
   * @param {string} orderUrl - URL of the order detail page
   */
  async fetchOrderDetails(orderUrl) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    try {
      await this.page.goto(orderUrl, { waitUntil: 'domcontentloaded' });
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(1000);

      const orderDetailsText = await this.page.locator('table.list').first().locator('tbody tr td.left').first().textContent();

      const orderNumber = CustomerConnectParser.extractOrderNumber(orderDetailsText);
      const poNumber = CustomerConnectParser.extractPONumberFromDetails(orderDetailsText);
      const orderDate = CustomerConnectParser.extractDate(orderDetailsText);
      const vendorName = CustomerConnectParser.extractVendorFromDetails(orderDetailsText);

      const orderStatus = await this.page.locator('table.list').last()
        .locator('tbody tr td:nth-child(2)').first().textContent()
        .catch(() => 'Unknown');

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

      console.log(`✓ Extracted order details: #${orderNumber} with ${items.length} items`);
      return orderData;
    } catch (error) {
      console.error('Fetch order details error:', error.message);
      await this.takeScreenshot('fetch-order-details-error');
      throw new Error(`Failed to fetch order details: ${error.message}`);
    }
  }

  /**
   * Extract line items from order detail page
   */
  async extractLineItems() {
    const items = [];
    const itemRows = await this.page.locator('table.list:nth-of-type(3) tbody tr').all();

    for (const row of itemRows) {
      try {
        const itemName = await row.locator('td:nth-child(1)').textContent().then(t => t.trim()).catch(() => '');
        const itemSKU = await row.locator('td:nth-child(2)').textContent().then(t => t.trim()).catch(() => '');
        const itemQuantity = await row.locator('td:nth-child(3)').textContent()
          .then(t => parseFloat(t.trim()))
          .catch(() => 0);
        const itemPrice = await row.locator('td:nth-child(4)').textContent()
          .then(t => parseFloat(t.replace(/[$,]/g, '')))
          .catch(() => 0);
        const itemTotal = await row.locator('td:nth-child(5)').textContent()
          .then(t => parseFloat(t.replace(/[$,]/g, '')))
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
      } catch (error) {
        console.warn('Error extracting item row:', error.message);
      }
    }

    return items;
  }

  /**
   * Extract totals from order detail page
   */
  async extractTotals() {
    const subtotal = await this.page.locator('table.list:nth-of-type(3) tfoot tr')
      .filter({ hasText: 'Sub-Total' })
      .locator('td.right')
      .last()
      .textContent()
      .then(text => parseFloat(text.replace(/[$,]/g, '')))
      .catch(() => 0);

    const tax = await this.page.locator('table.list:nth-of-type(3) tfoot tr')
      .filter({ hasText: 'Tax' })
      .locator('td.right')
      .last()
      .textContent()
      .then(text => parseFloat(text.replace(/[$,]/g, '')))
      .catch(() => 0);

    const shipping = await this.page.locator('table.list:nth-of-type(3) tfoot tr')
      .filter({ hasText: 'Shipping' })
      .locator('td.right')
      .last()
      .textContent()
      .then(text => parseFloat(text.replace(/[$,]/g, '')))
      .catch(() => 0);

    const total = await this.page.locator('table.list:nth-of-type(3) tfoot tr')
      .filter({ hasText: 'Total' })
      .locator('td.right')
      .last()
      .textContent()
      .then(text => parseFloat(text.replace(/[$,]/g, '')))
      .catch(() => 0);

    return { subtotal, tax, shipping, total };
  }
}

module.exports = CustomerConnectAutomation;
