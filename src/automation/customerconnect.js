const { chromium } = require('playwright');
const selectors = require('../selectors/customerconnect.selectors');
const SyncLog = require('../models/SyncLog');
const path = require('path');
const fs = require('fs').promises;

class CustomerConnectAutomation {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.baseUrl = process.env.CUSTOMERCONNECT_BASE_URL || 'https://envirostore.mycustomerconnect.com';
    this.username = process.env.CUSTOMERCONNECT_USERNAME;
    this.password = process.env.CUSTOMERCONNECT_PASSWORD;
    this.headless = process.env.HEADLESS !== 'false';
    this.screenshotDir = path.join(__dirname, '../../uploads/screenshots');
  }

  /**
   * Initialize browser and create new page
   */
  async init() {
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    this.page = await context.newPage();

    // Set default timeout
    this.page.setDefaultTimeout(30000);

    return this;
  }

  /**
   * Login to CustomerConnect
   */
  async login() {
    if (!this.username || !this.password) {
      throw new Error('CustomerConnect credentials not configured');
    }

    try {
      console.log('Navigating to CustomerConnect login page...');
      await this.page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' });

      console.log('Waiting for page to load...');
      await this.page.waitForTimeout(2000); // Wait for any dynamic content

      // Handle cookie consent if present
      try {
        const cookieButton = await this.page.$(selectors.login.cookieAcceptButton);
        if (cookieButton) {
          console.log('Accepting cookies...');
          await cookieButton.click();
          await this.page.waitForTimeout(1000);
        }
      } catch (error) {
        console.log('No cookie dialog found, continuing...');
      }

      // Wait for login form
      console.log('Waiting for login form...');
      await this.page.waitForSelector(selectors.login.usernameInput, {
        timeout: 15000,
        state: 'visible'
      });

      console.log('Filling username...');
      await this.page.fill(selectors.login.usernameInput, '');
      await this.page.waitForTimeout(500);
      await this.page.fill(selectors.login.usernameInput, this.username);

      console.log('Filling password...');
      await this.page.fill(selectors.login.passwordInput, '');
      await this.page.waitForTimeout(500);
      await this.page.fill(selectors.login.passwordInput, this.password);

      console.log('Taking screenshot before login...');
      await this.takeScreenshot('before-login');

      // Click submit button
      console.log('Clicking login button...');
      await this.page.click(selectors.login.submitButton);

      // Wait for navigation after login
      console.log('Waiting for login to complete...');
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });
      await this.page.waitForTimeout(2000);

      // Take screenshot after login
      await this.takeScreenshot('after-login');

      // Check if login was successful by looking for error message
      const hasError = await this.page.$(selectors.login.errorMessage);
      if (hasError) {
        const errorText = await this.page.textContent(selectors.login.errorMessage);
        throw new Error(`Login failed: ${errorText}`);
      }

      // Verify login success by checking for logged-in indicator
      console.log('Verifying login success...');
      try {
        await this.page.waitForSelector(selectors.login.loggedInIndicator, {
          timeout: 10000,
          state: 'visible'
        });
      } catch (error) {
        // If no specific logged-in indicator, check that login form is gone
        const stillOnLoginPage = await this.page.$(selectors.login.usernameInput);
        if (stillOnLoginPage) {
          throw new Error('Login appears to have failed - still on login page');
        }
      }

      this.isLoggedIn = true;
      console.log('✓ Successfully logged in to CustomerConnect');

      return true;
    } catch (error) {
      console.error('Login error:', error.message);
      await this.takeScreenshot('login-error');
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Navigate to orders page
   */
  async navigateToOrders() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    try {
      console.log('Navigating to orders page...');

      // Navigate directly to the order history URL
      await this.page.goto(this.baseUrl + '/index.php?route=account/order', {
        waitUntil: 'domcontentloaded'
      });
      await this.page.waitForLoadState('networkidle', { timeout: 20000 });
      await this.page.waitForTimeout(2000);

      // Verify we're on the orders page
      console.log('Verifying orders page loaded...');
      await this.page.waitForSelector(selectors.ordersList.ordersTable, {
        timeout: 15000,
        state: 'visible'
      });

      console.log('✓ Successfully navigated to orders page');
      await this.takeScreenshot('orders-page');

      return true;
    } catch (error) {
      console.error('Navigation error:', error.message);
      await this.takeScreenshot('navigate-orders-error');
      throw new Error(`Failed to navigate to orders: ${error.message}`);
    }
  }

  /**
   * Fetch list of orders
   */
  async fetchOrdersList(limit = 50) {
    await this.navigateToOrders();

    try {
      console.log(`Fetching up to ${limit} orders...`);

      // Wait for orders container
      await this.page.waitForSelector(selectors.ordersList.ordersTable, { timeout: 10000 });

      const orders = [];
      let hasNextPage = true;
      let pageCount = 0;
      const maxPages = Math.ceil(limit / 10); // CustomerConnect shows 10 orders per page

      while (hasNextPage && pageCount < maxPages) {
        console.log(`Processing page ${pageCount + 1}...`);

        // Wait for order containers to load
        await this.page.waitForSelector(selectors.ordersList.orderRows, {
          timeout: 10000,
          state: 'visible'
        });
        await this.page.waitForTimeout(1000);

        // Get order div containers
        const orderDivs = await this.page.$$(selectors.ordersList.orderRows);
        console.log(`Found ${orderDivs.length} order containers on this page`);

        for (const orderDiv of orderDivs) {
          if (orders.length >= limit) break;

          try {
            // Extract order ID (format: "Order ID: #75938")
            const orderIdText = await orderDiv.$eval(
              selectors.ordersList.orderNumber,
              el => el.textContent.trim()
            ).catch(() => null);
            const orderNumber = orderIdText ? orderIdText.replace(/Order ID:\s*#?/i, '').trim() : null;

            // Extract status (format: "Status: Processing")
            const statusText = await orderDiv.$eval(
              selectors.ordersList.orderStatus,
              el => el.textContent.trim()
            ).catch(() => null);
            const orderStatus = statusText ? statusText.replace(/Status:\s*/i, '').trim() : null;

            // Extract date and total from order-content div
            const contentText = await orderDiv.$eval(
              selectors.ordersList.orderDate,
              el => el.textContent
            ).catch(() => '');

            // Parse date (format: "Date Added: 02/02/2026")
            const dateMatch = contentText.match(/Date Added:\s*(\d{2}\/\d{2}\/\d{4})/i);
            const orderDate = dateMatch ? dateMatch[1] : null;

            // Parse total (format: "Total: $1,513.80")
            const totalMatch = contentText.match(/Total:\s*\$?([\d,]+\.?\d*)/i);
            const orderTotal = totalMatch ? totalMatch[1] : null;

            // Parse vendor (format: "Vendor(s): Sani-Pod Inc,")
            const vendorMatch = contentText.match(/Vendor\(s\):\s*([^,\n]+)/i);
            const vendorName = vendorMatch ? vendorMatch[1].trim() : null;

            // Parse PO Number (format: "PO Number(s): 72660,")
            const poMatch = contentText.match(/PO Number\(s\):\s*([^,\n]+)/i);
            const poNumber = poMatch ? poMatch[1].trim() : null;

            // Get detail link
            const orderLink = await orderDiv.$eval(
              selectors.ordersList.orderLink,
              el => el.getAttribute('href')
            ).catch(() => null);

            if (orderNumber) {
              orders.push({
                orderNumber,
                orderDate,
                status: orderStatus,
                total: orderTotal,
                vendorName,
                poNumber,
                detailUrl: orderLink ? new URL(orderLink, this.baseUrl).href : null
              });
              console.log(`  ✓ Extracted order: #${orderNumber} - ${orderDate} - ${orderStatus} - $${orderTotal} - ${vendorName}`);
            }
          } catch (error) {
            console.warn('  ⚠ Error extracting order div:', error.message);
          }
        }

        // Check for next page
        if (orders.length < limit) {
          const nextButton = await this.page.$(selectors.pagination.nextButton);

          if (nextButton) {
            console.log('Going to next page...');
            await nextButton.click();
            await this.page.waitForLoadState('networkidle', { timeout: 20000 });
            await this.page.waitForTimeout(2000);
            pageCount++;
          } else {
            console.log('No more pages available');
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      }

      console.log(`✓ Fetched ${orders.length} orders from CustomerConnect`);
      return orders;
    } catch (error) {
      console.error('Fetch orders list error:', error.message);
      await this.takeScreenshot('fetch-orders-list-error');
      throw new Error(`Failed to fetch orders list: ${error.message}`);
    }
  }

  /**
   * Fetch order details
   */
  async fetchOrderDetails(orderUrl) {
    try {
      console.log('Fetching order details from:', orderUrl);
      await this.page.goto(orderUrl, { waitUntil: 'domcontentloaded' });
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(1000);

      // Extract order details from first table
      const orderDetailsText = await this.page.locator('table.list').first().locator('tbody tr td.left').first().textContent();

      // Parse order number (format: "Order ID: #75938")
      const orderNumberMatch = orderDetailsText.match(/Order ID:\s*#?(\d+)/i);
      const orderNumber = orderNumberMatch ? orderNumberMatch[1] : '';

      // Parse PO number (format: "PO #: PO-2025-0072660")
      const poNumberMatch = orderDetailsText.match(/PO #:\s*([^\n]+)/i);
      const poNumber = poNumberMatch ? poNumberMatch[1].trim() : '';

      // Parse date (format: "Date Added: 02/02/2026")
      const dateMatch = orderDetailsText.match(/Date Added:\s*(\d{2}\/\d{2}\/\d{4})/i);
      const orderDate = dateMatch ? dateMatch[1] : '';

      // Get status from Order History table (last table)
      const orderStatus = await this.page.locator('table.list').last().locator('tbody tr td:nth-child(2)').first().textContent().catch(() => 'Unknown');

      // Extract line items from products table (third table.list)
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

      // Extract totals from tfoot
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

      const orderData = {
        orderNumber,
        poNumber,
        orderDate,
        status: orderStatus?.trim() || '',
        vendor: {
          name: '',  // Vendor info is on the order list page, not detail page
          email: '',
          phone: ''
        },
        items,
        subtotal,
        tax,
        shipping,
        total
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
   * Take screenshot for debugging
   */
  async takeScreenshot(name) {
    try {
      await fs.mkdir(this.screenshotDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}-${timestamp}.png`;
      const filepath = path.join(this.screenshotDir, filename);

      await this.page.screenshot({ path: filepath, fullPage: true });
      console.log(`Screenshot saved: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error('Failed to take screenshot:', error.message);
      return null;
    }
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
    }
  }
}

module.exports = CustomerConnectAutomation;
