const RouteStarParser = require('../parsers/routestar.parser');

/**
 * Fetcher for RouteStar Invoices
 * Handles fetching invoices from pending and closed lists
 */
class RouteStarFetcher {
  constructor(page, navigator, selectors, baseUrl) {
    this.page = page;
    this.navigator = navigator;
    this.selectors = selectors;
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch pending invoices
   */
  async fetchPendingInvoices(limit = Infinity, direction = 'new') {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Fetching RouteStar Pending Invoices ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);

    await this.navigator.navigateToInvoices();

    // Sort by invoice number based on direction
    const sortDirection = direction === 'new' ? 'desc' : 'asc';
    await this.navigator.sortByInvoiceNumber(sortDirection);

    return await this.fetchInvoicesList(limit, this.selectors.invoicesList, 'pending');
  }

  /**
   * Fetch closed invoices
   */
  async fetchClosedInvoices(limit = Infinity, direction = 'new') {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Fetching RouteStar Closed Invoices ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);

    await this.navigator.navigateToClosedInvoices();

    // Sort by invoice number based on direction
    const sortDirection = direction === 'new' ? 'desc' : 'asc';
    await this.navigator.sortByInvoiceNumber(sortDirection);

    return await this.fetchInvoicesList(limit, this.selectors.closedInvoicesList, 'closed');
  }

  /**
   * Generic invoice list fetcher
   */
  async fetchInvoicesList(limit, selectors, type) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    const invoices = [];
    let hasNextPage = true;
    let pageCount = 0;
    const maxPages = fetchAll ? Infinity : Math.ceil(limit / 10);

    console.log(`📊 Pagination settings:`);
    console.log(`   - Fetch all: ${fetchAll}`);
    console.log(`   - Limit: ${limit === Infinity ? 'Infinity' : limit}`);
    console.log(`   - Max pages: ${maxPages === Infinity ? 'Infinity' : maxPages}`);

    while (hasNextPage && pageCount < maxPages) {
      console.log(`\n📄 Processing page ${pageCount + 1}...`);

      // Wait for invoice rows with lenient strategy
      try {
        await this.page.waitForSelector(selectors.invoiceRows, {
          timeout: 30000,  // Increased from 10s to 30s
          state: 'attached'  // Changed from 'visible' to 'attached' (more lenient)
        });
        console.log('✓ Invoice rows found in DOM');
      } catch (error) {
        console.log('⚠️  Invoice rows selector timeout - trying to proceed anyway');
        // Don't throw - table might still be loading dynamically
      }

      await this.page.waitForTimeout(3000);


      const masterTable = await this.page.$('div.ht_master');
      if (!masterTable) {
        console.log('❌ Could not find main table (div.ht_master)');
        throw new Error('Could not find main table (div.ht_master)');
      }
      console.log('✓ Found master table');

      const invoiceRows = await masterTable.$$('table.htCore tbody tr');
      console.log(`   Found ${invoiceRows.length} rows in table`);

      for (let i = 0; i < invoiceRows.length; i++) {
        const row = invoiceRows[i];
        if (!fetchAll && invoices.length >= limit) {
          console.log(`   Reached limit of ${limit} invoices, stopping`);
          break;
        }

        try {
          const invoiceData = await this.extractInvoiceData(row, selectors);
          if (invoiceData) {
            console.log(`  ✓ Row ${i + 1}: Invoice #${invoiceData.invoiceNumber}`);
            invoices.push(invoiceData);
          } else {
            console.log(`  ⊘ Row ${i + 1}: Skipped (no invoice number or empty row)`);
          }
        } catch (error) {
          console.log(`  ✗ Row ${i + 1}: Error - ${error.message}`);
        }
      }

      console.log(`   Page ${pageCount + 1} complete: ${invoices.length} total invoices collected so far`);


      if (fetchAll || invoices.length < limit) {
        console.log('   Checking for next page...');
        hasNextPage = await this.navigator.goToNextPage();
        if (hasNextPage) {
          pageCount++;
          console.log(`   ✓ Moving to page ${pageCount + 1}`);
        } else {
          console.log(`   ✓ No more pages - completed after ${pageCount + 1} page(s)`);
        }
      } else {
        hasNextPage = false;
        console.log('   ✓ Reached desired limit, stopping pagination');
      }
    }

    console.log(`\n✅ Pagination complete:`);
    console.log(`   - Total pages processed: ${pageCount + 1}`);
    console.log(`   - Total invoices fetched: ${invoices.length}`);

    return invoices;
  }

  /**
   * Extract invoice data from row
   */
  async extractInvoiceData(row, selectors) {
    try {
      let invoiceNumber = null;
      try {
        invoiceNumber = await row.$eval(
          selectors.invoiceNumber,
          el => el.textContent.trim()
        );
      } catch (err) {
        try {
          invoiceNumber = await row.$eval(
            'td:nth-of-type(1)',
            el => el.textContent.trim()
          );
        } catch (err2) {
          // Could not extract invoice number
        }
      }

      if (!invoiceNumber) {
        return null;
      }

      const invoiceLink = await row.$eval(
        selectors.invoiceLink,
        el => el.getAttribute('href')
      ).catch(() => null);

      const invoiceDate = await row.$eval(
        selectors.invoiceDate,
        el => el.textContent.trim()
      ).catch(() => null);

      const enteredBy = await row.$eval(
        selectors.enteredBy,
        el => el.textContent.trim()
      ).catch(() => null);

      const assignedTo = await row.$eval(
        selectors.assignedTo,
        el => el.textContent.trim()
      ).catch(() => null);

      const stop = await row.$eval(
        selectors.stop,
        el => el.textContent.trim()
      ).catch(() => null);

      const customerName = await row.$eval(
        selectors.customerName,
        el => el.textContent.trim()
      ).catch(() => null);

      const customerLink = await row.$eval(
        selectors.customerLink,
        el => el.getAttribute('href')
      ).catch(() => null);

      const invoiceType = await row.$eval(
        selectors.invoiceType,
        el => el.textContent.trim()
      ).catch(() => null);

      const serviceNotes = await row.$eval(
        selectors.serviceNotes,
        el => el.textContent.trim()
      ).catch(() => null);

      
      const status = await row.$eval(
        selectors.status,
        (td) => {
          const className = td.className || '';
          const textContent = td.textContent.trim();

          if (className.includes('htInvalid') || className.includes('status-invalid')) {
            return 'Invalid';
          } else if (className.includes('status-complete') || textContent.toLowerCase().includes('complete')) {
            return 'Complete';
          } else if (className.includes('status-pending') || textContent.toLowerCase().includes('pending')) {
            return 'Pending';
          } else if (textContent) {
            return textContent;
          }

          return null;
        }
      ).catch(() => null);

      const total = await row.$eval(
        selectors.invoiceTotal,
        el => el.textContent.replace(/[$,]/g, '').trim()
      ).catch(() => '0.00');

      const lastModified = await row.$eval(
        selectors.lastModified,
        el => el.textContent.trim()
      ).catch(() => null);

      const payment = await row.$eval(
        selectors.payment,
        el => el.textContent.trim()
      ).catch(() => null);

      const arrivalTime = await row.$eval(
        selectors.arrivalTime,
        el => el.textContent.trim()
      ).catch(() => null);

      const isComplete = await row.$eval(
        selectors.complete,
        el => el.checked
      ).catch(() => false);

      const isPosted = await row.$eval(
        selectors.posted,
        el => el.checked
      ).catch(() => false);

      return {
        invoiceNumber,
        invoiceDate,
        enteredBy,
        assignedTo,
        stop,
        customerName,
        customerLink: customerLink ? new URL(customerLink, this.baseUrl).href : null,
        invoiceType,
        serviceNotes,
        status,
        isComplete,
        isPosted,
        total,
        lastModified,
        payment,
        arrivalTime,
        detailUrl: invoiceLink ? new URL(invoiceLink, this.baseUrl).href : null
      };
    } catch (error) {
      console.log(`    Error extracting row data: ${error.message}`);
      return null;
    }
  }
}

module.exports = RouteStarFetcher;
