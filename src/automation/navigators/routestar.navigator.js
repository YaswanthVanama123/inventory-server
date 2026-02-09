const config = require('../config/routestar.config');
const selectors = require('../selectors/routestar.selectors');

/**
 * Navigator for RouteStar Portal
 * Handles all navigation logic
 */
class RouteStarNavigator {
  constructor(page) {
    this.page = page;
    this.config = config;
    this.selectors = selectors;
  }

  /**
   * Navigate to invoices page (pending)
   */
  async navigateToInvoices() {
    const invoicesUrl = `${this.config.baseUrl}${this.config.routes.invoices}`;
    console.log(`Navigating to pending invoices: ${invoicesUrl}`);

    await this.page.goto(invoicesUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Check if we were redirected back to login
    const currentUrl = this.page.url();
    if (currentUrl.includes('/web/login')) {
      throw new Error('Redirected to login page - session may have expired');
    }

    console.log('Waiting for invoices table to appear...');
    await this.page.waitForSelector(this.selectors.invoicesList.invoicesTable, { timeout: 30000 });

    console.log('Waiting for page to stabilize...');
    await this.page.waitForTimeout(3000);

    console.log('✓ Successfully navigated to pending invoices page');
  }

  /**
   * Navigate to closed invoices page
   */
  async navigateToClosedInvoices() {
    const closedInvoicesUrl = `${this.config.baseUrl}${this.config.routes.closedInvoices}`;
    console.log(`Navigating to closed invoices: ${closedInvoicesUrl}`);

    await this.page.goto(closedInvoicesUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Check if we were redirected back to login
    const currentUrl = this.page.url();
    if (currentUrl.includes('/web/login')) {
      throw new Error('Redirected to login page - session may have expired');
    }

    console.log('Waiting for closed invoices table to appear...');
    await this.page.waitForSelector(this.selectors.closedInvoicesList.invoicesTable, { timeout: 30000 });

    console.log('Waiting for page to stabilize...');
    await this.page.waitForTimeout(3000);

    console.log('✓ Successfully navigated to closed invoices page');
  }

  /**
   * Navigate to invoice details
   */
  async navigateToInvoiceDetails(invoiceNumber) {
    const invoiceUrl = `${this.config.baseUrl}${this.config.routes.invoiceDetails}${invoiceNumber}`;
    await this.page.goto(invoiceUrl);
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1000);
  }

  /**
   * Go to next page
   */
  async goToNextPage() {
    const nextButton = await this.page.$(this.selectors.pagination.nextButton);

    if (!nextButton) {
      return false;
    }

    
    try {
      const dialog = await this.page.$('.jconfirm');
      if (dialog) {
        const cancelButton = await this.page.$('.jconfirm button:has-text("CANCEL"), .jconfirm .btn-default');
        if (cancelButton) {
          await cancelButton.click();
          await this.page.waitForTimeout(500);
        } else {
          await this.page.keyboard.press('Escape');
          await this.page.waitForTimeout(500);
        }
      }
    } catch (err) {
      
    }

    await nextButton.click();
    await this.page.waitForTimeout(3000);
    return true;
  }
}

module.exports = RouteStarNavigator;
