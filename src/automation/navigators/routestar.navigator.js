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

    // Capture JavaScript console errors
    const jsErrors = [];
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        jsErrors.push(msg.text());
        console.log(`  ⚠️  JavaScript Error: ${msg.text()}`);
      }
    });

    // Capture failed network requests
    const failedRequests = [];
    this.page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()?.errorText || 'Unknown error'
      });
      console.log(`  ⚠️  Network Request Failed: ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Try load first for proper JavaScript execution
    // RouteStar needs JS to render Handsontable - commit returns too early
    const strategies = [
      { name: 'load', waitUntil: 'load', timeout: 60000 },  // Try load first (JS executes)
      { name: 'domcontentloaded', waitUntil: 'domcontentloaded', timeout: 30000 },  // Fallback
      { name: 'commit', waitUntil: 'commit', timeout: 30000 }  // Last resort
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
    // For 'load' and 'domcontentloaded', JavaScript already executed so table should be there
    if (usedStrategy === 'commit' || usedStrategy === 'no-wait') {
      console.log('Commit/no-wait strategy used - waiting for Handsontable library to load...');

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
    } else {
      // For load/domcontentloaded, just wait a bit for table to fully render
      console.log('Load/DOMContentLoaded strategy used - table should already be rendered');
      await this.page.waitForTimeout(3000);  // Just 3 seconds
    }

    // Wait for page to stabilize
    await this.page.waitForTimeout(2000);

    // Take screenshot after navigation
    try {
      const screenshotPath = `./screenshots/after-navigation-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot after navigation: ${screenshotPath}`);
    } catch (e) {
      console.log(`⚠️  Could not save screenshot: ${e.message}`);
    }

    // If we used 'commit' or 'no-wait', actively poll for pagination as sign of data loaded
    if (usedStrategy === 'commit' || usedStrategy === 'no-wait') {
      console.log('Used lenient strategy - waiting for pagination to appear (sign that data loaded)...');

      // Wait for pagination elements - this means data has loaded!
      const paginationSelectors = [
        '.pagination',
        'ul.pagination',
        '.paginationjs',
        '[class*="pagination"]',
        'a[href*="page"]'
      ];

      const maxWait = 90;  // 90 attempts × 2 seconds = 180 seconds (3 minutes)
      let paginationFound = false;
      let foundSelector = null;

      for (let attempt = 1; attempt <= maxWait; attempt++) {
        // Try all pagination selectors
        for (const selector of paginationSelectors) {
          const paginationEl = await this.page.$(selector);
          if (paginationEl) {
            // Check if it's actually visible
            const isVisible = await paginationEl.isVisible().catch(() => false);
            if (!isVisible) continue;

            // Check if it has actual content (page numbers/links)
            const hasContent = await paginationEl.evaluate(el => {
              const text = el.innerText.trim();
              const hasLinks = el.querySelectorAll('a, li').length > 0;
              const hasPageNumbers = /\d+/.test(text);  // Contains numbers
              return (hasLinks || hasPageNumbers) && text.length > 0;
            }).catch(() => false);

            if (hasContent) {
              paginationFound = true;
              foundSelector = selector;
              console.log(`✓ Pagination found after ${attempt * 2} seconds using selector: ${selector}`);
              break;
            }
          }
        }

        if (paginationFound) break;

        if (attempt % 10 === 0) {  // Log every 20 seconds
          console.log(`  Still waiting for pagination... (${attempt * 2}s elapsed)`);

          // Take screenshot every 30 seconds
          if (attempt % 15 === 0) {
            try {
              const screenshotPath = `./screenshots/waiting-${attempt * 2}s-${Date.now()}.png`;
              await this.page.screenshot({ path: screenshotPath, fullPage: true });
              console.log(`  📸 Screenshot at ${attempt * 2}s: ${screenshotPath}`);
            } catch (e) {
              // Ignore screenshot errors
            }
          }
        }

        await this.page.waitForTimeout(2000);
      }

      if (!paginationFound) {
        console.log('⚠️  Pagination did not appear - data may not have loaded');

        // Debug what's on the page
        console.log('🔍 Debugging - checking page content...');

        const pageInfo = await this.page.evaluate(() => {
          // Check for JavaScript errors
          const errors = window.__pageErrors || [];

          // Check for loading indicators
          const loadingSpinner = document.querySelector('.loader, .spinner, .loading, [class*="load"]');
          const hasLoadingSpinner = !!loadingSpinner;
          const spinnerVisible = loadingSpinner ? loadingSpinner.offsetParent !== null : false;

          // Check Handsontable status
          const hasHandsontableLib = typeof window.Handsontable !== 'undefined';
          const handsontableInstances = window.Handsontable ? Object.keys(window.Handsontable).length : 0;

          return {
            title: document.title,
            readyState: document.readyState,
            bodyText: document.body.innerText.substring(0, 500),
            hasPagination: !!document.querySelector('.pagination, ul.pagination, .paginationjs'),
            hasTable: !!document.querySelector('table'),
            hasMasterTable: !!document.querySelector('div.ht_master'),
            hasLoadingSpinner,
            spinnerVisible,
            hasHandsontableLib,
            handsontableInstances,
            jsErrors: errors.length
          };
        }).catch(() => ({
          title: 'unknown',
          readyState: 'unknown',
          bodyText: 'Could not get body text',
          hasPagination: false,
          hasTable: false,
          hasMasterTable: false,
          hasLoadingSpinner: false,
          spinnerVisible: false,
          hasHandsontableLib: false,
          handsontableInstances: 0,
          jsErrors: 0
        }));

        console.log(`   Page title: "${pageInfo.title}"`);
        console.log(`   Document ready state: ${pageInfo.readyState}`);
        console.log(`   Has pagination: ${pageInfo.hasPagination}`);
        console.log(`   Has any table: ${pageInfo.hasTable}`);
        console.log(`   Has div.ht_master: ${pageInfo.hasMasterTable}`);
        console.log(`   ⚠️  LOADING SPINNER VISIBLE: ${pageInfo.spinnerVisible}`);
        console.log(`   Handsontable library loaded: ${pageInfo.hasHandsontableLib}`);
        console.log(`   Handsontable instances: ${pageInfo.handsontableInstances}`);
        console.log(`   JavaScript errors: ${pageInfo.jsErrors}`);
        console.log(`   Page body preview: ${pageInfo.bodyText.substring(0, 200)}...`);

        // Take final screenshot
        try {
          const screenshotPath = `./screenshots/debug-no-pagination-${Date.now()}.png`;
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`   📸 Screenshot saved: ${screenshotPath}`);
        } catch (e) {
          console.log(`   Could not save screenshot: ${e.message}`);
        }
      } else {
        console.log(`✓ Data loaded! Pagination appeared using: ${foundSelector}`);

        // Take screenshot when pagination found
        try {
          const screenshotPath = `./screenshots/pagination-found-${Date.now()}.png`;
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`📸 Screenshot with pagination: ${screenshotPath}`);
        } catch (e) {
          // Ignore
        }

        // Now wait a bit more for Handsontable to fully render
        console.log('Waiting for Handsontable to fully render...');
        await this.page.waitForTimeout(5000);
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

    // Summary of errors captured
    if (jsErrors.length > 0) {
      console.log(`⚠️  Total JavaScript errors captured: ${jsErrors.length}`);
    }
    if (failedRequests.length > 0) {
      console.log(`⚠️  Total failed network requests: ${failedRequests.length}`);
      failedRequests.forEach(req => {
        console.log(`     - ${req.url}: ${req.failure}`);
      });
    }

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

    // Capture JavaScript console errors
    const jsErrors = [];
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        jsErrors.push(msg.text());
        console.log(`  ⚠️  JavaScript Error: ${msg.text()}`);
      }
    });

    // Capture failed network requests
    const failedRequests = [];
    this.page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()?.errorText || 'Unknown error'
      });
      console.log(`  ⚠️  Network Request Failed: ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Try load first for proper JavaScript execution
    // RouteStar needs JS to render Handsontable - commit returns too early
    const strategies = [
      { name: 'load', waitUntil: 'load', timeout: 60000 },  // Try load first (JS executes)
      { name: 'domcontentloaded', waitUntil: 'domcontentloaded', timeout: 30000 },  // Fallback
      { name: 'commit', waitUntil: 'commit', timeout: 30000 }  // Last resort
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
    // For 'load' and 'domcontentloaded', JavaScript already executed so table should be there
    if (usedStrategy === 'commit' || usedStrategy === 'no-wait') {
      console.log('Commit/no-wait strategy used - waiting for Handsontable library to load...');

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
    } else {
      // For load/domcontentloaded, just wait a bit for table to fully render
      console.log('Load/DOMContentLoaded strategy used - table should already be rendered');
      await this.page.waitForTimeout(3000);  // Just 3 seconds
    }

    // Wait for page to stabilize
    await this.page.waitForTimeout(2000);

    // Take screenshot after navigation
    try {
      const screenshotPath = `./screenshots/closed-after-navigation-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot after navigation: ${screenshotPath}`);
    } catch (e) {
      console.log(`⚠️  Could not save screenshot: ${e.message}`);
    }

    // If we used 'commit' or 'no-wait', actively poll for pagination as sign of data loaded
    if (usedStrategy === 'commit' || usedStrategy === 'no-wait') {
      console.log('Used lenient strategy - waiting for pagination to appear (sign that data loaded)...');

      // Wait for pagination elements - this means data has loaded!
      const paginationSelectors = [
        '.pagination',
        'ul.pagination',
        '.paginationjs',
        '[class*="pagination"]',
        'a[href*="page"]'
      ];

      const maxWait = 90;  // 90 attempts × 2 seconds = 180 seconds (3 minutes)
      let paginationFound = false;
      let foundSelector = null;

      for (let attempt = 1; attempt <= maxWait; attempt++) {
        // Try all pagination selectors
        for (const selector of paginationSelectors) {
          const paginationEl = await this.page.$(selector);
          if (paginationEl) {
            // Check if it's actually visible
            const isVisible = await paginationEl.isVisible().catch(() => false);
            if (!isVisible) continue;

            // Check if it has actual content (page numbers/links)
            const hasContent = await paginationEl.evaluate(el => {
              const text = el.innerText.trim();
              const hasLinks = el.querySelectorAll('a, li').length > 0;
              const hasPageNumbers = /\d+/.test(text);  // Contains numbers
              return (hasLinks || hasPageNumbers) && text.length > 0;
            }).catch(() => false);

            if (hasContent) {
              paginationFound = true;
              foundSelector = selector;
              console.log(`✓ Pagination found after ${attempt * 2} seconds using selector: ${selector}`);
              break;
            }
          }
        }

        if (paginationFound) break;

        if (attempt % 10 === 0) {  // Log every 20 seconds
          console.log(`  Still waiting for pagination... (${attempt * 2}s elapsed)`);

          // Take screenshot every 30 seconds
          if (attempt % 15 === 0) {
            try {
              const screenshotPath = `./screenshots/closed-waiting-${attempt * 2}s-${Date.now()}.png`;
              await this.page.screenshot({ path: screenshotPath, fullPage: true });
              console.log(`  📸 Screenshot at ${attempt * 2}s: ${screenshotPath}`);
            } catch (e) {
              // Ignore screenshot errors
            }
          }
        }

        await this.page.waitForTimeout(2000);
      }

      if (!paginationFound) {
        console.log('⚠️  Pagination did not appear - data may not have loaded');

        // Debug what's on the page
        console.log('🔍 Debugging - checking page content...');

        const pageInfo = await this.page.evaluate(() => {
          // Check for JavaScript errors
          const errors = window.__pageErrors || [];

          // Check for loading indicators
          const loadingSpinner = document.querySelector('.loader, .spinner, .loading, [class*="load"]');
          const hasLoadingSpinner = !!loadingSpinner;
          const spinnerVisible = loadingSpinner ? loadingSpinner.offsetParent !== null : false;

          // Check Handsontable status
          const hasHandsontableLib = typeof window.Handsontable !== 'undefined';
          const handsontableInstances = window.Handsontable ? Object.keys(window.Handsontable).length : 0;

          return {
            title: document.title,
            readyState: document.readyState,
            bodyText: document.body.innerText.substring(0, 500),
            hasPagination: !!document.querySelector('.pagination, ul.pagination, .paginationjs'),
            hasTable: !!document.querySelector('table'),
            hasMasterTable: !!document.querySelector('div.ht_master'),
            hasLoadingSpinner,
            spinnerVisible,
            hasHandsontableLib,
            handsontableInstances,
            jsErrors: errors.length
          };
        }).catch(() => ({
          title: 'unknown',
          readyState: 'unknown',
          bodyText: 'Could not get body text',
          hasPagination: false,
          hasTable: false,
          hasMasterTable: false,
          hasLoadingSpinner: false,
          spinnerVisible: false,
          hasHandsontableLib: false,
          handsontableInstances: 0,
          jsErrors: 0
        }));

        console.log(`   Page title: "${pageInfo.title}"`);
        console.log(`   Document ready state: ${pageInfo.readyState}`);
        console.log(`   Has pagination: ${pageInfo.hasPagination}`);
        console.log(`   Has any table: ${pageInfo.hasTable}`);
        console.log(`   Has div.ht_master: ${pageInfo.hasMasterTable}`);
        console.log(`   ⚠️  LOADING SPINNER VISIBLE: ${pageInfo.spinnerVisible}`);
        console.log(`   Handsontable library loaded: ${pageInfo.hasHandsontableLib}`);
        console.log(`   Handsontable instances: ${pageInfo.handsontableInstances}`);
        console.log(`   JavaScript errors: ${pageInfo.jsErrors}`);
        console.log(`   Page body preview: ${pageInfo.bodyText.substring(0, 200)}...`);

        // Take final screenshot
        try {
          const screenshotPath = `./screenshots/closed-debug-no-pagination-${Date.now()}.png`;
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`   📸 Screenshot saved: ${screenshotPath}`);
        } catch (e) {
          console.log(`   Could not save screenshot: ${e.message}`);
        }
      } else {
        console.log(`✓ Data loaded! Pagination appeared using: ${foundSelector}`);

        // Take screenshot when pagination found
        try {
          const screenshotPath = `./screenshots/closed-pagination-found-${Date.now()}.png`;
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`📸 Screenshot with pagination: ${screenshotPath}`);
        } catch (e) {
          // Ignore
        }

        // Now wait a bit more for Handsontable to fully render
        console.log('Waiting for Handsontable to fully render...');
        await this.page.waitForTimeout(5000);
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

    // Summary of errors captured
    if (jsErrors.length > 0) {
      console.log(`⚠️  Total JavaScript errors captured: ${jsErrors.length}`);
    }
    if (failedRequests.length > 0) {
      console.log(`⚠️  Total failed network requests: ${failedRequests.length}`);
      failedRequests.forEach(req => {
        console.log(`     - ${req.url}: ${req.failure}`);
      });
    }

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
