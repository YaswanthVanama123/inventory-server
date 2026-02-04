const { chromium } = require('playwright');
const selectors = require('../selectors/routestar.selectors');
const SyncLog = require('../models/SyncLog');
const path = require('path');
const fs = require('fs').promises;

class RouteStarAutomation {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.baseUrl = process.env.ROUTESTAR_BASE_URL || 'https://emnrv.routestar.online';
    this.username = process.env.ROUTESTAR_USERNAME;
    this.password = process.env.ROUTESTAR_PASSWORD;
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
   * Login to RouteStar
   */
  async login() {
    if (!this.username || !this.password) {
      throw new Error('RouteStar credentials not configured');
    }

    try {
      console.log('Navigating to RouteStar login page...');
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
      console.log('✓ Successfully logged in to RouteStar');

      return true;
    } catch (error) {
      console.error('Login error:', error.message);
      await this.takeScreenshot('login-error');
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Navigate to invoices page
   */
  async navigateToInvoices() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    try {
      console.log('Navigating to invoices page...');

      // Try to find and click the invoices link
      const invoicesLink = await this.page.$(selectors.navigation.invoicesLink);
      if (invoicesLink) {
        console.log('Clicking invoices link...');
        await invoicesLink.click();
        await this.page.waitForLoadState('networkidle', { timeout: 20000 });
        await this.page.waitForTimeout(2000);
      } else {
        console.log('Invoices link not found, checking if already on invoices page...');
      }

      // Verify we're on the invoices page
      console.log('Verifying invoices page loaded...');
      await this.page.waitForSelector(selectors.invoicesList.invoicesTable, {
        timeout: 15000,
        state: 'visible'
      });

      console.log('✓ Successfully navigated to invoices page');
      await this.takeScreenshot('invoices-page');

      return true;
    } catch (error) {
      console.error('Navigation error:', error.message);
      await this.takeScreenshot('navigate-invoices-error');
      throw new Error(`Failed to navigate to invoices: ${error.message}`);
    }
  }

  /**
   * Fetch list of invoices
   */
  async fetchInvoicesList(limit = 50) {
    await this.navigateToInvoices();

    try {
      console.log(`Fetching up to ${limit} invoices...`);

      // Wait for invoices table
      await this.page.waitForSelector(selectors.invoicesList.invoicesTable, { timeout: 10000 });

      const invoices = [];
      let hasNextPage = true;
      let pageCount = 0;
      const maxPages = Math.ceil(limit / 20); // Assuming ~20 invoices per page

      while (hasNextPage && pageCount < maxPages) {
        console.log(`Processing page ${pageCount + 1}...`);

        // Wait for rows to load
        await this.page.waitForSelector(selectors.invoicesList.invoiceRows, {
          timeout: 10000,
          state: 'visible'
        });
        await this.page.waitForTimeout(1000);

        // Get invoice rows
        const invoiceRows = await this.page.$$(selectors.invoicesList.invoiceRows);
        console.log(`Found ${invoiceRows.length} invoice rows on this page`);

        for (const row of invoiceRows) {
          if (invoices.length >= limit) break;

          try {
            const invoiceNumber = await row.$eval(
              selectors.invoicesList.invoiceNumber,
              el => el.textContent.trim()
            ).catch(() => null);

            const invoiceDate = await row.$eval(
              selectors.invoicesList.invoiceDate,
              el => el.textContent.trim()
            ).catch(() => null);

            const invoiceStatus = await row.$eval(
              selectors.invoicesList.invoiceStatus,
              el => el.textContent.trim()
            ).catch(() => null);

            const invoiceTotal = await row.$eval(
              selectors.invoicesList.invoiceTotal,
              el => el.textContent.trim()
            ).catch(() => null);

            const customerName = await row.$eval(
              selectors.invoicesList.customerName,
              el => el.textContent.trim()
            ).catch(() => null);

            const invoiceLink = await row.$eval(
              selectors.invoicesList.invoiceLink,
              el => el.getAttribute('href')
            ).catch(() => null);

            if (invoiceNumber) {
              invoices.push({
                invoiceNumber,
                invoiceDate,
                status: invoiceStatus,
                total: invoiceTotal,
                customerName,
                detailUrl: invoiceLink ? new URL(invoiceLink, this.baseUrl).href : null
              });
              console.log(`  ✓ Extracted invoice: ${invoiceNumber}`);
            }
          } catch (error) {
            console.warn('  ⚠ Error extracting invoice row:', error.message);
          }
        }

        // Check for next page
        if (invoices.length < limit) {
          const nextButton = await this.page.$(selectors.pagination.nextButton);
          const isDisabled = nextButton
            ? await nextButton.evaluate(el => el.disabled || el.classList.contains('disabled'))
            : true;

          if (nextButton && !isDisabled) {
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

      console.log(`✓ Fetched ${invoices.length} invoices from RouteStar`);
      return invoices;
    } catch (error) {
      console.error('Fetch invoices list error:', error.message);
      await this.takeScreenshot('fetch-invoices-list-error');
      throw new Error(`Failed to fetch invoices list: ${error.message}`);
    }
  }

  /**
   * Fetch invoice details
   */
  async fetchInvoiceDetails(invoiceUrl) {
    try {
      await this.page.goto(invoiceUrl);
      await this.page.waitForLoadState('networkidle');

      // Extract invoice details
      const invoiceNumber = await this.page.textContent(selectors.invoiceDetail.invoiceNumber).catch(() => null);
      const invoiceDate = await this.page.textContent(selectors.invoiceDetail.invoiceDate).catch(() => null);
      const invoiceStatus = await this.page.textContent(selectors.invoiceDetail.invoiceStatus).catch(() => null);

      // Extract customer information
      const customerName = await this.page.textContent(selectors.invoiceDetail.customerName).catch(() => null);
      const customerEmail = await this.page.textContent(selectors.invoiceDetail.customerEmail).catch(() => null);
      const customerPhone = await this.page.textContent(selectors.invoiceDetail.customerPhone).catch(() => null);
      const customerAddress = await this.page.textContent(selectors.invoiceDetail.customerAddress).catch(() => null);

      // Extract line items
      const items = [];
      const itemRows = await this.page.$$(selectors.invoiceDetail.itemRows);

      for (const row of itemRows) {
        try {
          const itemName = await row.$eval(
            selectors.invoiceDetail.itemName,
            el => el.textContent.trim()
          ).catch(() => null);

          const itemSKU = await row.$eval(
            selectors.invoiceDetail.itemSKU,
            el => el.textContent.trim()
          ).catch(() => null);

          const itemQuantity = await row.$eval(
            selectors.invoiceDetail.itemQuantity,
            el => parseFloat(el.textContent.trim().replace(/[^\d.]/g, ''))
          ).catch(() => 0);

          const itemPrice = await row.$eval(
            selectors.invoiceDetail.itemPrice,
            el => parseFloat(el.textContent.trim().replace(/[^\d.]/g, ''))
          ).catch(() => 0);

          const itemTotal = await row.$eval(
            selectors.invoiceDetail.itemTotal,
            el => parseFloat(el.textContent.trim().replace(/[^\d.]/g, ''))
          ).catch(() => 0);

          if (itemName) {
            items.push({
              name: itemName,
              sku: itemSKU || '',
              qty: itemQuantity,
              unitPrice: itemPrice,
              lineTotal: itemTotal
            });
          }
        } catch (error) {
          console.warn('Error extracting item row:', error.message);
        }
      }

      // Extract totals
      const subtotal = await this.page.textContent(selectors.invoiceDetail.subtotal)
        .then(text => parseFloat(text.replace(/[^\d.]/g, '')))
        .catch(() => 0);

      const tax = await this.page.textContent(selectors.invoiceDetail.tax)
        .then(text => parseFloat(text.replace(/[^\d.]/g, '')))
        .catch(() => 0);

      const discount = await this.page.textContent(selectors.invoiceDetail.discount)
        .then(text => parseFloat(text.replace(/[^\d.]/g, '')))
        .catch(() => 0);

      const total = await this.page.textContent(selectors.invoiceDetail.total)
        .then(text => parseFloat(text.replace(/[^\d.]/g, '')))
        .catch(() => 0);

      return {
        invoiceNumber: invoiceNumber?.trim() || '',
        invoiceDate: invoiceDate?.trim() || '',
        status: invoiceStatus?.trim() || '',
        customer: {
          name: customerName?.trim() || '',
          email: customerEmail?.trim() || '',
          phone: customerPhone?.trim() || '',
          address: customerAddress?.trim() || ''
        },
        items,
        subtotal,
        tax,
        discount,
        total
      };
    } catch (error) {
      await this.takeScreenshot('fetch-invoice-details-error');
      throw new Error(`Failed to fetch invoice details: ${error.message}`);
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

module.exports = RouteStarAutomation;
