const config = require('../config/routestar.config');
const selectors = require('../selectors/routestar.selectors');





class RouteStarNavigator {
  constructor(page) {
    this.page = page;
    this.config = config;
    this.selectors = selectors;
  }

  


  async navigateToInvoices() {
    const invoicesUrl = `${this.config.baseUrl}${this.config.routes.invoices}`;
    console.log(`Navigating to pending invoices: ${invoicesUrl}`);

    
    console.log('  Navigating to page...');

    try {
      
      await this.page.goto(invoicesUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      console.log('  ✓ Page HTML loaded');
    } catch (error) {
      
      console.log('  ⚠️  DOMContentLoaded timeout, trying commit...');
      await this.page.goto(invoicesUrl, {
        waitUntil: 'commit',
        timeout: 30000
      });
      console.log('  ✓ Navigation committed (fallback)');
    }

    
    const currentUrl = this.page.url();
    console.log(`Current URL: ${currentUrl}`);

    if (currentUrl.includes('/web/login')) {
      throw new Error('Redirected to login page - session may have expired');
    }

    
    console.log('Waiting for page structure to render...');
    await this.page.waitForTimeout(3000);  

    
    console.log('Waiting for invoice table to render (max 5 minutes)...');

    
    try {
      const screenshotPath = `./screenshots/waiting-0s-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  📸 Initial screenshot: ${screenshotPath}`);
    } catch (e) {
      console.log(`  ⚠️  Screenshot failed: ${e.message}`);
    }

    
    let tableRendered = false;
    const startTime = Date.now();
    const maxWaitMs = 300000;  
    const pollIntervalMs = 2000;  
    const logIntervalMs = 30000;  
    let lastLogTime = startTime;
    let lastScreenshotTime = startTime;

    while (!tableRendered && (Date.now() - startTime) < maxWaitMs) {
      
      const table = await this.page.$('table, .dataTables_wrapper, .handsontable, div.ht_master');
      if (table) {
        tableRendered = true;
        break;
      }

      const elapsed = Date.now() - startTime;

      
      if (elapsed - (lastLogTime - startTime) >= logIntervalMs) {
        console.log(`  Still waiting... (${Math.floor(elapsed / 1000)}s elapsed)`);
        lastLogTime = Date.now();
      }

      
      if (elapsed - (lastScreenshotTime - startTime) >= logIntervalMs) {
        try {
          const screenshotPath = `./screenshots/waiting-${Math.floor(elapsed / 1000)}s-${Date.now()}.png`;
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`  📸 Screenshot: ${screenshotPath}`);
          lastScreenshotTime = Date.now();
        } catch (e) {
          console.log(`  ⚠️  Screenshot failed: ${e.message}`);
          lastScreenshotTime = Date.now(); 
        }
      }

      await this.page.waitForTimeout(pollIntervalMs);
    }

    if (!tableRendered) {
      console.log('❌ Table did not render within 5 minutes');

      
      try {
        const screenshotPath = `./screenshots/table-not-rendered-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`  📸 Screenshot: ${screenshotPath}`);
      } catch (e) {
        
      }

      throw new Error('Invoices table did not render. Page may have failed to load properly.');
    }

    console.log('✓ Table rendered successfully');

    
    console.log('Waiting for table data to load...');
    await this.page.waitForTimeout(5000);

    
    try {
      const screenshotPath = `./screenshots/table-rendered-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot: ${screenshotPath}`);
    } catch (e) {
      
    }

    console.log('✓ Successfully navigated to pending invoices page');
  }

  



  async sortByInvoiceNumber(direction = 'desc') {
    console.log(`Sorting invoices by Invoice # (${direction === 'desc' ? 'newest first' : 'oldest first'})...`);

    try {
      
      let invoiceHeader = null;

      
      invoiceHeader = await this.page.$('table.htCore thead th:nth-of-type(2) .columnSorting');

      
      if (!invoiceHeader) {
        console.log('  Trying alternative selector...');
        invoiceHeader = await this.page.$('table.htCore thead th:nth-of-type(2)');
      }

      
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

      
      const isVisible = await invoiceHeader.isVisible().catch(() => false);
      if (!isVisible) {
        console.log('⚠️  Invoice # column header is not visible - will proceed without sorting');
        return false;
      }

      
      
      await invoiceHeader.click({ timeout: 5000 });
      await this.page.waitForTimeout(1500);
      console.log('  Clicked once (ascending)');

      if (direction === 'desc') {
        
        await invoiceHeader.click({ timeout: 5000 });
        await this.page.waitForTimeout(1500);
        console.log('  Clicked twice (descending)');
      }

      console.log(`✓ Table sorted by Invoice # (${direction === 'desc' ? 'descending' : 'ascending'})`);
      return true;
    } catch (error) {
      console.log(`⚠️  Sorting failed: ${error.message} - will proceed without sorting`);

      
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

  


  async navigateToClosedInvoices() {
    const closedInvoicesUrl = `${this.config.baseUrl}${this.config.routes.closedInvoices}`;
    console.log(`Navigating to closed invoices: ${closedInvoicesUrl}`);

    
    console.log('  Navigating to page...');

    try {
      
      await this.page.goto(closedInvoicesUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      console.log('  ✓ Page HTML loaded');
    } catch (error) {
      
      console.log('  ⚠️  DOMContentLoaded timeout, trying commit...');
      await this.page.goto(closedInvoicesUrl, {
        waitUntil: 'commit',
        timeout: 30000
      });
      console.log('  ✓ Navigation committed (fallback)');
    }

    
    const currentUrl = this.page.url();
    console.log(`Current URL: ${currentUrl}`);

    if (currentUrl.includes('/web/login')) {
      throw new Error('Redirected to login page - session may have expired');
    }

    
    console.log('Waiting for page structure to render...');
    await this.page.waitForTimeout(3000);  

    
    console.log('Waiting for closed invoices table to render (max 5 minutes)...');

    
    try {
      const screenshotPath = `./screenshots/closed-waiting-0s-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  📸 Initial screenshot: ${screenshotPath}`);
    } catch (e) {
      console.log(`  ⚠️  Screenshot failed: ${e.message}`);
    }

    
    let tableRendered = false;
    const startTime = Date.now();
    const maxWaitMs = 300000;  
    const pollIntervalMs = 2000;  
    const logIntervalMs = 30000;  
    let lastLogTime = startTime;
    let lastScreenshotTime = startTime;

    while (!tableRendered && (Date.now() - startTime) < maxWaitMs) {
      
      const table = await this.page.$('table, .dataTables_wrapper, .handsontable, div.ht_master');
      if (table) {
        tableRendered = true;
        break;
      }

      const elapsed = Date.now() - startTime;

      
      if (elapsed - (lastLogTime - startTime) >= logIntervalMs) {
        console.log(`  Still waiting... (${Math.floor(elapsed / 1000)}s elapsed)`);
        lastLogTime = Date.now();
      }

      
      if (elapsed - (lastScreenshotTime - startTime) >= logIntervalMs) {
        try {
          const screenshotPath = `./screenshots/closed-waiting-${Math.floor(elapsed / 1000)}s-${Date.now()}.png`;
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`  📸 Screenshot: ${screenshotPath}`);
          lastScreenshotTime = Date.now();
        } catch (e) {
          
        }
      }

      await this.page.waitForTimeout(pollIntervalMs);
    }

    if (!tableRendered) {
      console.log('❌ Table did not render within 5 minutes');

      
      try {
        const screenshotPath = `./screenshots/closed-table-not-rendered-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`  📸 Screenshot: ${screenshotPath}`);
      } catch (e) {
        
      }

      throw new Error('Closed invoices table did not render.');
    }

    console.log('✓ Table rendered successfully');

    
    console.log('Waiting for table data to load...');
    await this.page.waitForTimeout(5000);

    
    try {
      const screenshotPath = `./screenshots/closed-table-rendered-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot: ${screenshotPath}`);
    } catch (e) {
      
    }

    console.log('✓ Successfully navigated to closed invoices page');
  }

  


  async navigateToItems() {
    const itemsUrl = `${this.config.baseUrl}${this.config.routes.items}`;
    console.log(`Navigating to items list: ${itemsUrl}`);

    
    console.log('  Navigating to page...');

    try {
      
      await this.page.goto(itemsUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      console.log('  ✓ Page HTML loaded');
    } catch (error) {
      
      console.log('  ⚠️  DOMContentLoaded timeout, trying commit...');
      await this.page.goto(itemsUrl, {
        waitUntil: 'commit',
        timeout: 30000
      });
      console.log('  ✓ Navigation committed (fallback)');
    }

    
    const currentUrl = this.page.url();
    console.log(`Current URL: ${currentUrl}`);

    if (currentUrl.includes('/web/login')) {
      throw new Error('Redirected to login page - session may have expired');
    }

    
    console.log('Waiting for page structure to render...');
    await this.page.waitForTimeout(3000);  

    
    console.log('Waiting for items table to render (max 5 minutes)...');

    
    try {
      const screenshotPath = `./screenshots/items-waiting-0s-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  📸 Initial screenshot: ${screenshotPath}`);
    } catch (e) {
      console.log(`  ⚠️  Screenshot failed: ${e.message}`);
    }

    
    let tableRendered = false;
    const startTime = Date.now();
    const maxWaitMs = 300000;  
    const pollIntervalMs = 2000;  
    const logIntervalMs = 30000;  
    let lastLogTime = startTime;
    let lastScreenshotTime = startTime;

    while (!tableRendered && (Date.now() - startTime) < maxWaitMs) {
      
      const table = await this.page.$('table, .dataTables_wrapper, .handsontable, div.ht_master');
      if (table) {
        tableRendered = true;
        break;
      }

      const elapsed = Date.now() - startTime;

      
      if (elapsed - (lastLogTime - startTime) >= logIntervalMs) {
        console.log(`  Still waiting... (${Math.floor(elapsed / 1000)}s elapsed)`);
        lastLogTime = Date.now();
      }

      
      if (elapsed - (lastScreenshotTime - startTime) >= logIntervalMs) {
        try {
          const screenshotPath = `./screenshots/items-waiting-${Math.floor(elapsed / 1000)}s-${Date.now()}.png`;
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`  📸 Screenshot: ${screenshotPath}`);
          lastScreenshotTime = Date.now();
        } catch (e) {
          console.log(`  ⚠️  Screenshot failed: ${e.message}`);
          lastScreenshotTime = Date.now(); 
        }
      }

      await this.page.waitForTimeout(pollIntervalMs);
    }

    if (!tableRendered) {
      console.log('❌ Table did not render within 5 minutes');

      
      try {
        const screenshotPath = `./screenshots/items-table-not-rendered-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`  📸 Screenshot: ${screenshotPath}`);
      } catch (e) {
        
      }

      throw new Error('Items table did not render. Page may have failed to load properly.');
    }

    console.log('✓ Table rendered successfully');

    
    console.log('Waiting for table data to load...');
    await this.page.waitForTimeout(5000);

    
    try {
      const screenshotPath = `./screenshots/items-table-rendered-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot: ${screenshotPath}`);
    } catch (e) {
      
    }

    console.log('✓ Successfully navigated to items page');
  }

  


  async setItemsPerPageToAll() {
    console.log('Setting items per page to "All"...');

    try {
      
      await this.page.waitForSelector('#items_per_page', { timeout: 10000 });

      
      await this.page.selectOption('#items_per_page', 'All');
      console.log('✓ Selected "All" items per page');

      
      console.log('Waiting for table to reload with all items (this may take 15-20 seconds for large datasets)...');
      await this.page.waitForTimeout(15000);  

      
      try {
        const screenshotPath = `./screenshots/items-all-loaded-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Screenshot: ${screenshotPath}`);
      } catch (e) {
        
      }

      console.log('✓ All items loaded');
      return true;
    } catch (error) {
      console.log(`⚠️  Could not set items per page to All: ${error.message}`);
      console.log('   Will fall back to pagination');
      return false;
    }
  }

  


  async navigateToInvoiceDetails(invoiceNumber) {
    const invoiceUrl = `${this.config.baseUrl}${this.config.routes.invoiceDetails}${invoiceNumber}`;

    
    try {
      await this.page.goto(invoiceUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } catch (error) {
      
      await this.page.goto(invoiceUrl, {
        waitUntil: 'commit',
        timeout: 30000
      });
    }

    
    await this.page.waitForTimeout(2000);
  }

  


  async goToNextPage() {
    console.log('Checking for next page button...');

    
    const allPaginationElements = await this.page.$$('.pagination li, .paginationjs li, [class*="pagination"] li');
    console.log(`   Found ${allPaginationElements.length} pagination list items in total`);

    for (let i = 0; i < allPaginationElements.length; i++) {
      const element = allPaginationElements[i];
      const className = await element.getAttribute('class');
      const text = await element.textContent();
      const isVisible = await element.isVisible().catch(() => false);
      console.log(`   Pagination item ${i + 1}: class="${className}", text="${text?.trim()}", visible=${isVisible}`);
    }

    
    const nextButton = await this.page.$('.pagination li.next');
    if (nextButton) {
      const isNextDisabled = await nextButton.evaluate(el => {
        return el.classList.contains('disabled');
      });

      if (isNextDisabled) {
        console.log('✓ Next button is disabled - reached last page');
        return false;
      }
    }

    
    
    let currentPageNum = null;
    let nextPageElement = null;

    
    const activePage = await this.page.$('.pagination li.active');
    if (activePage) {
      const activeText = await activePage.textContent();
      currentPageNum = parseInt(activeText?.trim());
      console.log(`   📍 Current active page: ${currentPageNum}`);

      if (!isNaN(currentPageNum)) {
        
        const nextPageNum = currentPageNum + 1;
        console.log(`   🔍 Looking for page number ${nextPageNum}...`);

        
        const allPages = await this.page.$$('.pagination li:not(.prev):not(.next):not(.active)');

        for (const pageItem of allPages) {
          const pageText = await pageItem.textContent();
          const pageNum = parseInt(pageText?.trim());

          if (pageNum === nextPageNum) {
            
            const isDisabled = await pageItem.evaluate(el => {
              return el.classList.contains('disabled');
            });

            if (!isDisabled) {
              nextPageElement = pageItem;
              console.log(`   ✓ Found next page element: ${nextPageNum}`);
              break;
            } else {
              console.log(`   ⚠️  Page ${nextPageNum} element found but is disabled`);
            }
          }
        }
      }
    }

    
    if (!nextPageElement) {
      console.log(`   ℹ️  Could not find next page number, falling back to "next" button strategy`);

      
      
      let nextButton = null;
      let usedMethod = null;

      
      const nextCandidates = await this.page.$$('.pagination li.next, .pagination li[class*="next"]');
      console.log(`   Found ${nextCandidates.length} elements with "next" in class name`);

      for (let i = 0; i < nextCandidates.length; i++) {
        const candidate = nextCandidates[i];
        const className = await candidate.getAttribute('class');
        const text = await candidate.textContent();
        const isDisabled = className?.includes('disabled') || false;
        const isVisible = await candidate.isVisible().catch(() => false);

        console.log(`   Next candidate ${i + 1}: class="${className}", text="${text?.trim()}", disabled=${isDisabled}, visible=${isVisible}`);

        
        if (isDisabled) {
          continue;
        }

        
        
        const textContent = text?.trim() || '';

        
        
        if (textContent.includes('>>') ||
            textContent.includes('»»') ||
            textContent.includes('Last') ||
            textContent.match(/\d{2,}/)) {  
          console.log(`   ⚠️  Skipping candidate ${i + 1} - appears to be fast-forward button: "${textContent}"`);
          continue;
        }

        
        nextButton = candidate;
        usedMethod = `next candidate ${i + 1} (class="${className}", text="${textContent}")`;
        console.log(`   ✓ Selected next button: ${usedMethod}`);
        break;
      }

      if (!nextButton) {
        console.log('❌ Next button not found - may be on last page');
        return false;
      }

      
      const isDisabled = await nextButton.evaluate(el => {
        
        if (el.classList.contains('disabled')) return true;
        if (el.hasAttribute('disabled')) return true;
        if (el.parentElement && el.parentElement.classList.contains('disabled')) return true;

        
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

      nextPageElement = nextButton;
      console.log(`✓ Next button is enabled, preparing to click (${usedMethod})`);
    }

    
    let firstItemBefore = null;
    try {
      const masterTable = await this.page.$('div.ht_master');
      if (masterTable) {
        const firstRow = await masterTable.$('table.htCore tbody tr:first-child td:nth-of-type(2)');
        if (firstRow) {
          firstItemBefore = await firstRow.textContent();
          console.log(`   Current first item: "${firstItemBefore?.trim()}"`);
        }
      }
    } catch (e) {
      
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

    
    try {
      await nextPageElement.scrollIntoViewIfNeeded();
      console.log('   ✓ Scrolled pagination into view');
      await this.page.waitForTimeout(500); 
    } catch (e) {
      console.log('   ⚠️  Could not scroll pagination into view, attempting click anyway');
    }

    
    const nextLink = await nextPageElement.$('a');
    if (nextLink) {
      const linkText = await nextLink.textContent();
      const linkHref = await nextLink.getAttribute('href');
      console.log(`Clicking pagination link: text="${linkText?.trim()}", href="${linkHref}"`);

      
      try {
        await nextLink.click({ timeout: 5000 });
      } catch (e) {
        console.log('   ⚠️  Regular click failed, trying force click via JavaScript');
        await nextLink.evaluate(el => el.click());
      }
    } else {
      const buttonText = await nextPageElement.textContent();
      console.log(`Clicking pagination element directly: text="${buttonText?.trim()}"`);

      try {
        await nextPageElement.click({ timeout: 5000 });
      } catch (e) {
        console.log('   ⚠️  Regular click failed, trying force click via JavaScript');
        await nextPageElement.evaluate(el => el.click());
      }
    }

    console.log('Waiting for table to reload...');

    
    if (firstItemBefore) {
      let pageChanged = false;
      for (let i = 0; i < 15; i++) {  
        await this.page.waitForTimeout(1000);

        try {
          const masterTable = await this.page.$('div.ht_master');
          if (masterTable) {
            const firstRow = await masterTable.$('table.htCore tbody tr:first-child td:nth-of-type(2)');
            if (firstRow) {
              const firstItemAfter = await firstRow.textContent();
              if (firstItemAfter && firstItemAfter !== firstItemBefore) {
                console.log(`   ✓ Page changed - new first item: "${firstItemAfter.trim()}"`);
                pageChanged = true;
                break;
              }
            }
          }
        } catch (e) {
          
        }
      }

      if (!pageChanged) {
        console.log(`   ⚠️  Warning: Page content may not have changed after clicking next`);
      }
    } else {
      
      await this.page.waitForTimeout(5000); 
    }

    return true;
  }
}

module.exports = RouteStarNavigator;
