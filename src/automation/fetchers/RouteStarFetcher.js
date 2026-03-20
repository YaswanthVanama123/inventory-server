const RouteStarParser = require('../parsers/routestar.parser');


class RouteStarFetcher {
  constructor(page, navigator, selectors, baseUrl) {
    this.page = page;
    this.navigator = navigator;
    this.selectors = selectors;
    this.baseUrl = baseUrl;
  }
  async fetchPendingInvoices(limit = Infinity, direction = 'new') {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Fetching RouteStar Pending Invoices ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);
    await this.navigator.navigateToInvoices();
    const sortDirection = direction === 'new' ? 'desc' : 'asc';
    await this.navigator.sortByInvoiceNumber(sortDirection);
    return await this.fetchInvoicesList(limit, this.selectors.invoicesList, 'pending');
  }
  async fetchClosedInvoices(limit = Infinity, direction = 'new') {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Fetching RouteStar Closed Invoices ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);
    await this.navigator.navigateToClosedInvoices();
    const sortDirection = direction === 'new' ? 'desc' : 'asc';
    await this.navigator.sortByInvoiceNumber(sortDirection);
    return await this.fetchInvoicesList(limit, this.selectors.closedInvoicesList, 'closed');
  }
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
      try {
        await this.page.waitForSelector(selectors.invoiceRows, {
          timeout: 30000,  
          state: 'attached'  
        });
        console.log('✓ Invoice rows found in DOM');
      } catch (error) {
        console.log('⚠️  Invoice rows selector timeout - trying to proceed anyway');
      }
      await this.page.waitForTimeout(3000);
      const masterTable = await this.page.$('div.ht_master');
      if (!masterTable) {
        console.log('⚠️  No master table found - likely no invoices on this page');
        if (pageCount === 0) {
          console.log('✓ No invoices found (table doesn\'t exist) - this is normal if there are 0 pending invoices');
          break; 
        } else {
          console.log('✓ Reached end of pagination (no more pages)');
          break; 
        }
      }
      console.log('✓ Found master table');
      const invoiceRows = await masterTable.$$('table.htCore tbody tr');
      console.log(`   Found ${invoiceRows.length} rows in table`);
      if (invoiceRows.length === 0) {
        console.log('⚠️  Table exists but has 0 rows - no invoices on this page');
        if (pageCount === 0) {
          console.log('✓ No invoices found (empty table) - this is normal if there are 0 pending invoices');
        }
        break; 
      }
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
    if (invoices.length === 0) {
      console.log(`   ℹ️  Note: 0 invoices found - this is normal if there are no ${type} invoices currently`);
    }
    return invoices;
  }
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

      // Extract stop only if selector exists (pending invoices only)
      const stop = selectors.stop ? await row.$eval(
        selectors.stop,
        el => el.textContent.trim()
      ).catch(() => null) : null;

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

      // Extract subtotal if selector exists (closed invoices only)
      const subtotal = selectors.subtotal ? await row.$eval(
        selectors.subtotal,
        el => el.textContent.replace(/[$,]/g, '').trim()
      ).catch(() => '0.00') : null;

      const total = await row.$eval(
        selectors.invoiceTotal,
        el => el.textContent.replace(/[$,]/g, '').trim()
      ).catch(() => '0.00');

      // Extract dateCompleted if selector exists (closed invoices only)
      const dateCompleted = selectors.dateCompleted ? await row.$eval(
        selectors.dateCompleted,
        el => el.textContent.trim()
      ).catch(() => null) : null;

      const lastModified = await row.$eval(
        selectors.lastModified,
        el => el.textContent.trim()
      ).catch(() => null);

      // Extract arrivalTime (closed invoices)
      const arrivalTime = selectors.arrivalTime ? await row.$eval(
        selectors.arrivalTime,
        el => el.textContent.trim()
      ).catch(() => null) : null;

      // Extract departureTime (closed invoices)
      const departureTime = selectors.departureTime ? await row.$eval(
        selectors.departureTime,
        el => el.textContent.trim()
      ).catch(() => null) : null;

      // Extract elapsedTime (closed invoices)
      const elapsedTime = selectors.elapsedTime ? await row.$eval(
        selectors.elapsedTime,
        el => el.textContent.trim()
      ).catch(() => null) : null;

      // Extract customerGrouping (closed invoices)
      const customerGrouping = selectors.customerGrouping ? await row.$eval(
        selectors.customerGrouping,
        el => el.textContent.trim()
      ).catch(() => null) : null;

      // Extract postedBy (closed invoices)
      const postedBy = selectors.postedBy ? await row.$eval(
        selectors.postedBy,
        el => el.textContent.trim()
      ).catch(() => null) : null;

      // Extract postedTimestamp (closed invoices)
      const postedTimestamp = selectors.postedTimestamp ? await row.$eval(
        selectors.postedTimestamp,
        el => el.textContent.trim()
      ).catch(() => null) : null;

      // Extract paymentMethod (closed invoices)
      const paymentMethod = selectors.paymentMethod ? await row.$eval(
        selectors.paymentMethod,
        el => el.textContent.trim()
      ).catch(() => null) : null;

      // Extract payment only if selector exists (pending invoices only)
      const payment = selectors.payment ? await row.$eval(
        selectors.payment,
        el => el.textContent.trim()
      ).catch(() => null) : null;

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
        subtotal,
        total,
        dateCompleted,
        lastModified,
        payment,
        arrivalTime,
        departureTime,
        elapsedTime,
        customerGrouping,
        postedBy,
        postedTimestamp,
        paymentMethod,
        detailUrl: invoiceLink ? new URL(invoiceLink, this.baseUrl).href : null
      };
    } catch (error) {
      console.log(`    Error extracting row data: ${error.message}`);
      return null;
    }
  }
}
module.exports = RouteStarFetcher;
