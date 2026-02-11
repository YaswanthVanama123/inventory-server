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
   * Sort table by Invoice # column
   * @param {string} direction - 'asc' for ascending (old first), 'desc' for descending (new first)
   */
  async sortByInvoiceNumber(direction = 'desc') {
    console.log(`Sorting invoices by Invoice # (${direction === 'desc' ? 'newest first' : 'oldest first'})...`);

    try {
      // Try different selectors for the Invoice # column header
      let invoiceHeader = null;

      // Try selector 1: .columnSorting in 2nd th
      invoiceHeader = await this.page.$('table.htCore thead th:nth-of-type(2) .columnSorting');

      // Try selector 2: Just the 2nd th element itself
      if (!invoiceHeader) {
        console.log('  Trying alternative selector...');
        invoiceHeader = await this.page.$('table.htCore thead th:nth-of-type(2)');
      }

      // Try selector 3: Look for span with text "Invoice #"
      if (!invoiceHeader) {
        console.log('  Trying text-based selector...');
        const headers = await this.page.$$('table.htCore thead th');
        for (const header of headers) {
          const text = await header.textContent();
          if (text && text.includes('Invoice #')) {
            invoiceHeader = header;
            break;
          }
        }
      }

      if (!invoiceHeader) {
        console.log('⚠️  Could not find Invoice # column header for sorting - will proceed without sorting');
        return false;
      }

      // Check if element is visible before clicking
      const isVisible = await invoiceHeader.isVisible().catch(() => false);
      if (!isVisible) {
        console.log('⚠️  Invoice # column header is not visible - will proceed without sorting');
        return false;
      }

      // Click once for ascending (default), twice for descending
      // First click - ascending
      await invoiceHeader.click({ timeout: 5000 });
      await this.page.waitForTimeout(1500);
      console.log('  Clicked once (ascending)');

      if (direction === 'desc') {
        // Second click - descending
        await invoiceHeader.click({ timeout: 5000 });
        await this.page.waitForTimeout(1500);
        console.log('  Clicked twice (descending)');
      }

      console.log(`✓ Table sorted by Invoice # (${direction === 'desc' ? 'descending' : 'ascending'})`);
      return true;
    } catch (error) {
      console.log(`⚠️  Sorting failed: ${error.message} - will proceed without sorting`);

      // Take screenshot for debugging
      try {
        const timestamp = Date.now();
        const screenshotPath = `./screenshots/sort-failed-${timestamp}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`  Screenshot saved to: ${screenshotPath}`);
      } catch (screenshotError) {
        console.log(`  Could not save screenshot: ${screenshotError.message}`);
      }

      return false;
    }
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
    console.log('Checking for next page button...');

    // Try multiple selectors for the next button
    const selectors = [
      this.selectors.pagination.nextButton,           // Original: .pagination li.next:not(.disabled)
      '.pagination li.next',                          // Without :not(.disabled)
      '.pagination .next',                             // Simpler selector
      'li.next a',                                     // Direct link
      'a[aria-label="Next"]',                          // Aria label
      'button:has-text("Next")',                       // Button with text
      '.paginationjs-next'                             // Alternative pagination library
    ];

    let nextButton = null;
    let usedSelector = null;

    for (const selector of selectors) {
      nextButton = await this.page.$(selector);
      if (nextButton) {
        usedSelector = selector;
        console.log(`✓ Found next button using selector: ${selector}`);
        break;
      }
    }

    if (!nextButton) {
      console.log('❌ Next button not found with any selector');

      // Debug: Log all pagination elements found
      const allPaginationElements = await this.page.$$('.pagination li, .paginationjs li, [class*="pagination"] li');
      console.log(`   Found ${allPaginationElements.length} pagination list items`);

      for (let i = 0; i < allPaginationElements.length; i++) {
        const element = allPaginationElements[i];
        const className = await element.getAttribute('class');
        const text = await element.textContent();
        console.log(`   Pagination item ${i + 1}: class="${className}", text="${text?.trim()}"`);
      }

      return false;
    }

    // Check if button is disabled
    const isDisabled = await nextButton.evaluate(el => {
      // Check various ways a button can be disabled
      if (el.classList.contains('disabled')) return true;
      if (el.hasAttribute('disabled')) return true;
      if (el.parentElement && el.parentElement.classList.contains('disabled')) return true;

      // Check if the link has href="javascript:void(0)" or "#" which often means disabled
      const link = el.querySelector('a');
      if (link) {
        const href = link.getAttribute('href');
        if (href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') {
          return true;
        }
      }

      return false;
    });

    if (isDisabled) {
      console.log('⚠️  Next button is disabled - reached last page');
      return false;
    }

    console.log('✓ Next button is enabled, preparing to click');

    // Close any dialogs that might be open
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
      // No dialog, continue
    }

    // Click the link inside the next button li element
    const nextLink = await nextButton.$('a');
    if (nextLink) {
      console.log('Clicking next page link...');
      await nextLink.click();
    } else {
      console.log('Clicking next button element...');
      await nextButton.click();
    }

    console.log('Waiting for page to load...');
    await this.page.waitForTimeout(3000);

    return true;
  }
}

module.exports = RouteStarNavigator;
