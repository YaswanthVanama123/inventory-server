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

    // Try commit first since RouteStar server is very slow
    // Commit works reliably while load/domcontentloaded often timeout
    const strategies = [
      { name: 'commit', waitUntil: 'commit', timeout: 60000 },  // Try lenient strategy first (works best for RouteStar)
      { name: 'load', waitUntil: 'load', timeout: 30000 },       // Fallback to load with shorter timeout
      { name: 'domcontentloaded', waitUntil: 'domcontentloaded', timeout: 30000 }  // Last resort
    ];

    let success = false;
    let usedStrategy = null;

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      const isLastAttempt = i === strategies.length - 1;

      try {
        console.log(`  Trying strategy: ${strategy.name} (timeout: ${strategy.timeout}ms)`);

        await this.page.goto(invoicesUrl, {
          waitUntil: strategy.waitUntil,
          timeout: strategy.timeout
        });

        success = true;
        usedStrategy = strategy.name;
        console.log(`  ✓ Navigation succeeded with strategy: ${strategy.name}`);
        break;
      } catch (error) {
        console.log(`  ✗ Strategy '${strategy.name}' failed: ${error.message.split('\n')[0]}`);

        if (isLastAttempt) {
          // Last resort - try without waiting at all
          console.log(`  → Last resort: Navigate without waiting for load events`);
          try {
            await this.page.goto(invoicesUrl, { timeout: 30000 });
            await this.page.waitForTimeout(5000);  // Just wait 5 seconds
            success = true;
            usedStrategy = 'no-wait';
            console.log(`  ✓ Navigation succeeded without waiting for events`);
            break;
          } catch (finalError) {
            throw new Error(`All navigation strategies failed: ${finalError.message}`);
          }
        }
      }
    }

    // Check if we were redirected back to login
    const currentUrl = this.page.url();
    console.log(`Current URL: ${currentUrl}`);

    if (currentUrl.includes('/web/login')) {
      throw new Error('Redirected to login page - session may have expired');
    }

    console.log('Waiting for page to stabilize and table to render...');

    // If we used 'commit' or 'no-wait', wait for Handsontable library to load
    if (usedStrategy === 'commit' || usedStrategy === 'no-wait') {
      console.log('Commit strategy used - waiting for Handsontable library to load...');

      // Wait specifically for Handsontable library (not the whole document)
      try {
        await this.page.waitForFunction(
          () => typeof window.Handsontable !== 'undefined',
          { timeout: 180000 }  // 3 minutes max
        );
        console.log('✓ Handsontable library loaded');
      } catch (e) {
        console.log('⚠️  Handsontable library did not load - trying to proceed anyway');
      }

      // Extra wait for Handsontable to initialize
      await this.page.waitForTimeout(10000);  // 10 seconds for initialization
    }

    // Wait for page to stabilize
    await this.page.waitForTimeout(3000);

    // If we used 'commit' or 'no-wait', actively poll for the table instead of blind waiting
    if (usedStrategy === 'commit' || usedStrategy === 'no-wait') {
      console.log('Used lenient strategy - actively polling for table container to appear...');

      // First wait for the main container (appears before Handsontable renders)
      const containerSelector = '#open-invoice-table';
      const maxContainerWait = 30;  // 30 attempts × 2 seconds = 60 seconds max
      let containerFound = false;

      for (let attempt = 1; attempt <= maxContainerWait; attempt++) {
        const containerExists = await this.page.$(containerSelector).then(el => !!el).catch(() => false);

        if (containerExists) {
          console.log(`✓ Invoice table container appeared after ${attempt * 2} seconds`);
          containerFound = true;
          break;
        }

        if (attempt % 5 === 0) {
          console.log(`  Still waiting for table container... (${attempt * 2}s elapsed)`);
        }

        await this.page.waitForTimeout(2000);
      }

      if (!containerFound) {
        console.log('⚠️  Table container did not appear - page may not have loaded');
      }

      // Now wait for Handsontable to render inside the container
      console.log('Waiting for Handsontable to render...');
      const maxTableWait = 60;  // 60 attempts × 2 seconds = 120 seconds (2 minutes)
      let found = false;

      for (let attempt = 1; attempt <= maxTableWait; attempt++) {
        const tableExists = await this.page.$('div.ht_master table.htCore').then(el => !!el).catch(() => false);

        if (tableExists) {
          console.log(`✓ Handsontable rendered after ${attempt * 2} additional seconds`);
          found = true;
          break;
        }

        if (attempt % 10 === 0) {  // Log every 20 seconds
          console.log(`  Still waiting for Handsontable to render... (${attempt * 2}s elapsed)`);
        }

        await this.page.waitForTimeout(2000);
      }

      if (!found) {
        console.log('⚠️  Handsontable did not render - checking for JavaScript errors...');

        // Check for JavaScript errors
        const jsErrors = await this.page.evaluate(() => {
          // Check if Handsontable is loaded
          const hasHandsontable = typeof window.Handsontable !== 'undefined';

          // Check for any error elements on page
          const errorElements = document.querySelectorAll('.alert-danger, .error, .alert');
          const errors = Array.from(errorElements).map(el => el.textContent.trim()).filter(t => t);

          return {
            hasHandsontable,
            pageErrors: errors,
            documentReadyState: document.readyState
          };
        }).catch(() => ({ hasHandsontable: false, pageErrors: [], documentReadyState: 'unknown' }));

        console.log(`   Handsontable library loaded: ${jsErrors.hasHandsontable}`);
        console.log(`   Document ready state: ${jsErrors.documentReadyState}`);
        if (jsErrors.pageErrors.length > 0) {
          console.log(`   Page errors found: ${jsErrors.pageErrors.join(', ')}`);
        }

        // Try to trigger table rendering manually if Handsontable is loaded
        if (jsErrors.hasHandsontable) {
          console.log('   Attempting to manually trigger table rendering...');
          try {
            await this.page.evaluate(() => {
              // Try calling the function that initializes the table (if it exists)
              if (typeof appleInvoiceFilter === 'function') {
                appleInvoiceFilter();
              }
            });
            await this.page.waitForTimeout(5000);

            // Check again if table appeared
            const tableNow = await this.page.$('div.ht_master table.htCore').then(el => !!el).catch(() => false);
            if (tableNow) {
              console.log('   ✓ Manual trigger worked - table appeared!');
              found = true;
            }
          } catch (e) {
            console.log(`   Manual trigger failed: ${e.message}`);
          }
        }

        if (!found) {
          console.log('🔍 Debugging - checking page content...');

          // Check for any div.ht_master
          const htMasterExists = await this.page.$('div.ht_master').then(el => !!el).catch(() => false);
          console.log(`   div.ht_master exists: ${htMasterExists}`);

          // Check for any table.htCore
          const htCoreExists = await this.page.$('table.htCore').then(el => !!el).catch(() => false);
          console.log(`   table.htCore exists: ${htCoreExists}`);

          // Check for any table at all
          const anyTableExists = await this.page.$('table').then(el => !!el).catch(() => false);
          console.log(`   Any table exists: ${anyTableExists}`);

          // Get page title
          const pageTitle = await this.page.title();
          console.log(`   Page title: "${pageTitle}"`);

          // Check for error messages or loading indicators
          const bodyText = await this.page.evaluate(() => {
            return document.body.innerText.substring(0, 500);  // First 500 chars
          }).catch(() => 'Could not get body text');
          console.log(`   Page body preview: ${bodyText.substring(0, 200)}...`);

          // Take a screenshot for debugging
          try {
            const screenshotPath = `./screenshots/debug-no-table-${Date.now()}.png`;
            await this.page.screenshot({ path: screenshotPath, fullPage: false });
            console.log(`   Screenshot saved: ${screenshotPath}`);
          } catch (e) {
            console.log(`   Could not save screenshot: ${e.message}`);
          }
        }
      }
    } else {
      // For 'load' or 'domcontentloaded', table should already be there
      try {
        await this.page.waitForSelector(this.selectors.invoicesList.invoicesTable, {
          timeout: 30000,
          state: 'attached'
        });
        console.log('✓ Table found in DOM');
      } catch (error) {
        console.log('⚠️  Table selector timeout - proceeding anyway');
      }
    }

    // Extra stabilization wait for table to fully populate
    console.log('Waiting for table to fully render...');
    await this.page.waitForTimeout(5000);

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

    // Try commit first since RouteStar server is very slow
    // Commit works reliably while load/domcontentloaded often timeout
    const strategies = [
      { name: 'commit', waitUntil: 'commit', timeout: 60000 },  // Try lenient strategy first (works best for RouteStar)
      { name: 'load', waitUntil: 'load', timeout: 30000 },       // Fallback to load with shorter timeout
      { name: 'domcontentloaded', waitUntil: 'domcontentloaded', timeout: 30000 }  // Last resort
    ];

    let success = false;
    let usedStrategy = null;

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      const isLastAttempt = i === strategies.length - 1;

      try {
        console.log(`  Trying strategy: ${strategy.name} (timeout: ${strategy.timeout}ms)`);

        await this.page.goto(closedInvoicesUrl, {
          waitUntil: strategy.waitUntil,
          timeout: strategy.timeout
        });

        success = true;
        usedStrategy = strategy.name;
        console.log(`  ✓ Navigation succeeded with strategy: ${strategy.name}`);
        break;
      } catch (error) {
        console.log(`  ✗ Strategy '${strategy.name}' failed: ${error.message.split('\n')[0]}`);

        if (isLastAttempt) {
          // Last resort - try without waiting at all
          console.log(`  → Last resort: Navigate without waiting for load events`);
          try {
            await this.page.goto(closedInvoicesUrl, { timeout: 30000 });
            await this.page.waitForTimeout(5000);
            success = true;
            usedStrategy = 'no-wait';
            console.log(`  ✓ Navigation succeeded without waiting for events`);
            break;
          } catch (finalError) {
            throw new Error(`All navigation strategies failed: ${finalError.message}`);
          }
        }
      }
    }

    // Check if we were redirected back to login
    const currentUrl = this.page.url();
    console.log(`Current URL: ${currentUrl}`);

    if (currentUrl.includes('/web/login')) {
      throw new Error('Redirected to login page - session may have expired');
    }

    console.log('Waiting for page to stabilize and table to render...');

    // If we used 'commit' or 'no-wait', wait for Handsontable library to load
    if (usedStrategy === 'commit' || usedStrategy === 'no-wait') {
      console.log('Commit strategy used - waiting for Handsontable library to load...');

      // Wait specifically for Handsontable library (not the whole document)
      try {
        await this.page.waitForFunction(
          () => typeof window.Handsontable !== 'undefined',
          { timeout: 180000 }  // 3 minutes max
        );
        console.log('✓ Handsontable library loaded');
      } catch (e) {
        console.log('⚠️  Handsontable library did not load - trying to proceed anyway');
      }

      // Extra wait for Handsontable to initialize
      await this.page.waitForTimeout(10000);  // 10 seconds for initialization
    }

    // Wait for page to stabilize
    await this.page.waitForTimeout(3000);

    // If we used 'commit' or 'no-wait', actively poll for the table instead of blind waiting
    if (usedStrategy === 'commit' || usedStrategy === 'no-wait') {
      console.log('Used lenient strategy - actively polling for table container to appear...');

      // First wait for the main container (appears before Handsontable renders)
      const containerSelector = '#open-invoice-table';
      const maxContainerWait = 30;  // 30 attempts × 2 seconds = 60 seconds max
      let containerFound = false;

      for (let attempt = 1; attempt <= maxContainerWait; attempt++) {
        const containerExists = await this.page.$(containerSelector).then(el => !!el).catch(() => false);

        if (containerExists) {
          console.log(`✓ Invoice table container appeared after ${attempt * 2} seconds`);
          containerFound = true;
          break;
        }

        if (attempt % 5 === 0) {
          console.log(`  Still waiting for table container... (${attempt * 2}s elapsed)`);
        }

        await this.page.waitForTimeout(2000);
      }

      if (!containerFound) {
        console.log('⚠️  Table container did not appear - page may not have loaded');
      }

      // Now wait for Handsontable to render inside the container
      console.log('Waiting for Handsontable to render...');
      const maxTableWait = 60;  // 60 attempts × 2 seconds = 120 seconds (2 minutes)
      let found = false;

      for (let attempt = 1; attempt <= maxTableWait; attempt++) {
        const tableExists = await this.page.$('div.ht_master table.htCore').then(el => !!el).catch(() => false);

        if (tableExists) {
          console.log(`✓ Handsontable rendered after ${attempt * 2} additional seconds`);
          found = true;
          break;
        }

        if (attempt % 10 === 0) {  // Log every 20 seconds
          console.log(`  Still waiting for Handsontable to render... (${attempt * 2}s elapsed)`);
        }

        await this.page.waitForTimeout(2000);
      }

      if (!found) {
        console.log('⚠️  Table did not appear after 60 seconds - will try to proceed anyway');

        // Debug: Check what's actually on the page
        console.log('🔍 Debugging - checking page content...');

        // Check for any div.ht_master
        const htMasterExists = await this.page.$('div.ht_master').then(el => !!el).catch(() => false);
        console.log(`   div.ht_master exists: ${htMasterExists}`);

        // Check for any table.htCore
        const htCoreExists = await this.page.$('table.htCore').then(el => !!el).catch(() => false);
        console.log(`   table.htCore exists: ${htCoreExists}`);

        // Check for any table at all
        const anyTableExists = await this.page.$('table').then(el => !!el).catch(() => false);
        console.log(`   Any table exists: ${anyTableExists}`);

        // Get page title
        const pageTitle = await this.page.title();
        console.log(`   Page title: "${pageTitle}"`);

        // Check for error messages or loading indicators
        const bodyText = await this.page.evaluate(() => {
          return document.body.innerText.substring(0, 500);  // First 500 chars
        }).catch(() => 'Could not get body text');
        console.log(`   Page body preview: ${bodyText.substring(0, 200)}...`);

        // Take a screenshot for debugging
        try {
          const screenshotPath = `./screenshots/debug-no-table-${Date.now()}.png`;
          await this.page.screenshot({ path: screenshotPath, fullPage: false });
          console.log(`   Screenshot saved: ${screenshotPath}`);
        } catch (e) {
          console.log(`   Could not save screenshot: ${e.message}`);
        }
      }
    } else {
      // For 'load' or 'domcontentloaded', table should already be there
      try {
        await this.page.waitForSelector(this.selectors.closedInvoicesList.invoicesTable, {
          timeout: 30000,
          state: 'attached'
        });
        console.log('✓ Table found in DOM');
      } catch (error) {
        console.log('⚠️  Table selector timeout - proceeding anyway');
      }
    }

    // Extra stabilization wait for table to fully populate
    console.log('Waiting for table to fully render...');
    await this.page.waitForTimeout(5000);

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
