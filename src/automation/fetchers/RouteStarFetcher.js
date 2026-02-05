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
  async fetchPendingInvoices(limit = Infinity) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Fetching RouteStar Pending Invoices ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);

    await this.navigator.navigateToInvoices();

    return await this.fetchInvoicesList(limit, this.selectors.invoicesList, 'pending');
  }

  /**
   * Fetch closed invoices
   */
  async fetchClosedInvoices(limit = Infinity) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Fetching RouteStar Closed Invoices ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);

    await this.navigator.navigateToClosedInvoices();

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

    while (hasNextPage && pageCount < maxPages) {
      await this.page.waitForSelector(selectors.invoiceRows, {
        timeout: 10000,
        state: 'visible'
      });
      await this.page.waitForTimeout(3000);

      
      const masterTable = await this.page.$('div.ht_master');
      if (!masterTable) {
        throw new Error('Could not find main table (div.ht_master)');
      }

      const invoiceRows = await masterTable.$$('table.htCore tbody tr');

      for (let i = 0; i < invoiceRows.length; i++) {
        const row = invoiceRows[i];
        if (!fetchAll && invoices.length >= limit) break;

        try {
          const invoiceData = await this.extractInvoiceData(row, selectors);
          if (invoiceData) {
            invoices.push(invoiceData);
          }
        } catch (error) {
          
        }
      }

      
      if (fetchAll || invoices.length < limit) {
        hasNextPage = await this.navigator.goToNextPage();
        if (hasNextPage) pageCount++;
      } else {
        hasNextPage = false;
      }
    }

    console.log(`   ✓ Fetched: ${invoices.length} ${type} invoices\n`);
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
            'td:nth-child(2)',
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
      return null;
    }
  }
}

module.exports = RouteStarFetcher;
