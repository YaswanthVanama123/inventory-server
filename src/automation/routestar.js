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
      await this.page.goto(this.baseUrl + '/web/login/', { waitUntil: 'domcontentloaded' });

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

      // Wait for navigation after login - use URL change or element disappearance
      console.log('Waiting for login to complete...');
      try {
        // Wait for login form to disappear (indicates navigation happened)
        await this.page.waitForSelector(selectors.login.usernameInput, {
          state: 'hidden',
          timeout: 15000
        });
      } catch (error) {
        console.log('Login form still visible, checking for errors...');
      }

      // Wait for page to settle a bit
      await this.page.waitForTimeout(3000);

      // Take screenshot after login
      await this.takeScreenshot('after-login');

      // Check if login was successful by looking for error message
      const hasError = await this.page.$(selectors.login.errorMessage);
      if (hasError) {
        const errorText = await this.page.textContent(selectors.login.errorMessage);
        throw new Error(`Login failed: ${errorText}`);
      }

      // Verify login success by checking that login form is gone
      console.log('Verifying login success...');
      const stillOnLoginPage = await this.page.$(selectors.login.usernameInput);
      if (stillOnLoginPage && await this.page.isVisible(selectors.login.usernameInput)) {
        throw new Error('Login appears to have failed - still on login page');
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

      // Navigate directly to invoices URL with more lenient wait strategy
      await this.page.goto(this.baseUrl + '/web/invoices/', {
        waitUntil: 'commit',
        timeout: 60000
      });

      // Wait for the page to have some content
      await this.page.waitForTimeout(5000);

      // Verify we're on the invoices page
      console.log('Verifying invoices page loaded...');
      await this.page.waitForSelector(selectors.invoicesList.invoicesTable, {
        timeout: 30000,
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
   * Navigate to closed invoices page
   */
  async navigateToClosedInvoices() {
    if (!this.isLoggedIn) {
      await this.login();
    }

    try {
      console.log('Navigating to closed invoices page...');

      // Navigate directly to closed invoices URL
      await this.page.goto(this.baseUrl + '/web/closedinvoices/', {
        waitUntil: 'commit',
        timeout: 60000
      });

      // Wait for the page to have some content
      await this.page.waitForTimeout(5000);

      // Verify we're on the closed invoices page
      console.log('Verifying closed invoices page loaded...');
      await this.page.waitForSelector(selectors.invoicesList.invoicesTable, {
        timeout: 30000,
        state: 'visible'
      });

      console.log('✓ Successfully navigated to closed invoices page');
      await this.takeScreenshot('closed-invoices-page');

      return true;
    } catch (error) {
      console.error('Navigation error:', error.message);
      await this.takeScreenshot('navigate-closed-invoices-error');
      throw new Error(`Failed to navigate to closed invoices: ${error.message}`);
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
      await this.page.waitForTimeout(2000);

      const invoices = [];
      let hasNextPage = true;
      let pageCount = 0;
      const maxPages = Math.ceil(limit / 10); // RouteStar shows 10 invoices per page by default

      while (hasNextPage && pageCount < maxPages) {
        console.log(`Processing page ${pageCount + 1}...`);

        // Wait for rows to load
        await this.page.waitForSelector(selectors.invoicesList.invoiceRows, {
          timeout: 10000,
          state: 'visible'
        });
        await this.page.waitForTimeout(3000); // Increased wait for JS to finish updating

        // Get ONLY the main table container to avoid cloned tables
        const masterTable = await this.page.$('div.ht_master');
        if (!masterTable) {
          throw new Error('Could not find main table (div.ht_master)');
        }

        // Get invoice rows from ONLY the master table
        const invoiceRows = await masterTable.$$('table.htCore tbody tr');
        console.log(`Found ${invoiceRows.length} invoice rows on this page`);

        for (let i = 0; i < invoiceRows.length; i++) {
          const row = invoiceRows[i];
          if (invoices.length >= limit) break;

          try {
            console.log(`  Processing row ${i + 1}/${invoiceRows.length}...`);

            // Extract invoice number and link
            // Try with <a> tag first, then try without if it fails
            let invoiceNumber = null;
            try {
              invoiceNumber = await row.$eval(
                selectors.invoicesList.invoiceNumber,
                el => el.textContent.trim()
              );
            } catch (err) {
              // If <a> tag doesn't exist, try just the td cell
              try {
                invoiceNumber = await row.$eval(
                  'td:nth-child(2)',
                  el => el.textContent.trim()
                );
              } catch (err2) {
                console.log(`    ⚠ Row ${i + 1}: Failed to extract invoice number: ${err2.message}`);
              }
            }

            if (!invoiceNumber) {
              // Debug: try to get any text from the row to see what we're dealing with
              const rowText = await row.textContent().catch(() => 'Could not get row text');
              console.log(`    ⚠ Row ${i + 1}: Skipping - no invoice number found`);
              console.log(`    Row content preview: ${rowText.substring(0, 100)}...`);
              continue;
            }

            const invoiceLink = await row.$eval(
              selectors.invoicesList.invoiceLink,
              el => el.getAttribute('href')
            ).catch(() => null);

            // Extract date (removing dropdown arrow)
            const invoiceDate = await row.$eval(
              selectors.invoicesList.invoiceDate,
              el => el.textContent.replace('▼', '').trim()
            ).catch(() => null);

            // Extract entered by (removing dropdown arrow)
            const enteredBy = await row.$eval(
              selectors.invoicesList.enteredBy,
              el => el.textContent.replace('▼', '').trim()
            ).catch(() => null);

            // Extract assigned to (removing dropdown arrow)
            const assignedTo = await row.$eval(
              selectors.invoicesList.assignedTo,
              el => el.textContent.replace('▼', '').trim()
            ).catch(() => null);

            // Extract stop number
            const stop = await row.$eval(
              selectors.invoicesList.stop,
              el => el.textContent.trim()
            ).catch(() => '0');

            // Extract customer name
            const customerName = await row.$eval(
              selectors.invoicesList.customerName,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract customer link
            const customerLink = await row.$eval(
              selectors.invoicesList.customerName,
              el => el.getAttribute('href')
            ).catch(() => null);

            // Extract type
            const invoiceType = await row.$eval(
              selectors.invoicesList.invoiceType,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract service notes
            const serviceNotes = await row.$eval(
              selectors.invoicesList.serviceNotes,
              el => el.textContent.trim()
            ).catch(() => '');

            // Extract status - use the class name to determine status reliably
            const status = await row.$eval(
              selectors.invoicesList.invoiceStatus,
              el => {
                const className = el.className || '';
                const textContent = el.textContent.trim();
                const result = {
                  className: className,
                  textContent: textContent,
                  status: ''
                };

                if (className.includes('label-warning')) {
                  result.status = 'Pending';
                } else if (className.includes('label-success')) {
                  result.status = 'Completed';
                } else if (className.includes('label-danger')) {
                  result.status = 'Cancelled';
                } else {
                  result.status = textContent;
                }

                return result;
              }
            ).catch((err) => {
              console.log(`    ⚠ Failed to extract status: ${err.message}`);
              return { status: null, className: '', textContent: '' };
            });

            console.log(`    DEBUG ${invoiceNumber}: class="${status.className}" text="${status.textContent}" => status="${status.status}"`);
            const finalStatus = status.status;

            // Extract total (removing $ and formatting)
            const total = await row.$eval(
              selectors.invoicesList.invoiceTotal,
              el => el.textContent.replace(/[$,]/g, '').trim()
            ).catch(() => '0.00');

            // Extract last modified
            const lastModified = await row.$eval(
              selectors.invoicesList.lastModified,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract payment status
            const payment = await row.$eval(
              selectors.invoicesList.payment,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract arrival time
            const arrivalTime = await row.$eval(
              selectors.invoicesList.arrivalTime,
              el => el.textContent.trim()
            ).catch(() => null);

            // Check if complete (checkbox checked)
            const isComplete = await row.$eval(
              selectors.invoicesList.complete,
              el => el.checked
            ).catch(() => false);

            // Check if posted (checkbox checked)
            const isPosted = await row.$eval(
              selectors.invoicesList.posted,
              el => el.checked
            ).catch(() => false);

            invoices.push({
              invoiceNumber,
              invoiceDate,
              enteredBy,
              assignedTo,
              stop,
              customerName,
              customerLink: customerLink ? new URL(customerLink, this.baseUrl).href : null,
              invoiceType,
              serviceNotes,
              status: finalStatus,
              isComplete,
              isPosted,
              total,
              lastModified,
              payment,
              arrivalTime,
              detailUrl: invoiceLink ? new URL(invoiceLink, this.baseUrl).href : null
            });
            console.log(`  ✓ Extracted invoice: ${invoiceNumber} - ${customerName} - $${total} - ${finalStatus}`);
          } catch (error) {
            console.warn('  ⚠ Error extracting invoice row:', error.message);
          }
        }

        // Check for next page
        if (invoices.length < limit) {
          const nextButton = await this.page.$(selectors.pagination.nextButton);

          if (nextButton) {
            console.log('Going to next page...');

            // Check for and dismiss any jconfirm dialogs that might be blocking
            try {
              const confirmDialog = await this.page.$('.jconfirm');
              if (confirmDialog) {
                console.log('  Dismissing confirmation dialog...');

                // Try multiple methods to dismiss the dialog
                // Method 1: Look for CANCEL button
                let dismissed = false;
                const cancelButton = await this.page.$('.jconfirm button:has-text("CANCEL"), .jconfirm .btn-default');
                if (cancelButton) {
                  await cancelButton.click();
                  await this.page.waitForTimeout(500);
                  dismissed = true;
                  console.log('  ✓ Dialog dismissed via CANCEL button');
                }

                // Method 2: Press Escape key to close dialog
                if (!dismissed) {
                  await this.page.keyboard.press('Escape');
                  await this.page.waitForTimeout(500);
                  console.log('  ✓ Dialog dismissed via Escape key');
                }
              }
            } catch (err) {
              console.log('  ⚠ Could not dismiss dialog, continuing anyway...');
            }

            await nextButton.click();
            await this.page.waitForTimeout(3000);
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
   * Fetch list of closed invoices
   */
  async fetchClosedInvoicesList(limit = 50) {
    await this.navigateToClosedInvoices();

    try {
      console.log(`Fetching up to ${limit} closed invoices...`);

      // Wait for invoices table
      await this.page.waitForSelector(selectors.closedInvoicesList.invoicesTable, { timeout: 10000 });
      await this.page.waitForTimeout(2000);

      const invoices = [];
      let hasNextPage = true;
      let pageCount = 0;
      const maxPages = Math.ceil(limit / 10); // RouteStar shows 10 invoices per page by default

      while (hasNextPage && pageCount < maxPages) {
        console.log(`Processing page ${pageCount + 1}...`);

        // Wait for rows to load
        await this.page.waitForSelector(selectors.closedInvoicesList.invoiceRows, {
          timeout: 10000,
          state: 'visible'
        });
        await this.page.waitForTimeout(3000); // Increased wait for JS to finish updating

        // Get ONLY the main table container to avoid cloned tables
        const masterTable = await this.page.$('div.ht_master');
        if (!masterTable) {
          throw new Error('Could not find main table (div.ht_master)');
        }

        // Get invoice rows from ONLY the master table
        const invoiceRows = await masterTable.$$('table.htCore tbody tr');
        console.log(`Found ${invoiceRows.length} invoice rows on this page`);

        for (let i = 0; i < invoiceRows.length; i++) {
          const row = invoiceRows[i];
          if (invoices.length >= limit) break;

          try {
            console.log(`  Processing row ${i + 1}/${invoiceRows.length}...`);

            // Extract invoice number and link
            let invoiceNumber = null;
            try {
              invoiceNumber = await row.$eval(
                selectors.closedInvoicesList.invoiceNumber,
                el => el.textContent.trim()
              );
            } catch (err) {
              // If <a> tag doesn't exist, try just the td cell
              try {
                invoiceNumber = await row.$eval(
                  'td:nth-child(2)',
                  el => el.textContent.trim()
                );
              } catch (err2) {
                console.log(`    ⚠ Row ${i + 1}: Failed to extract invoice number: ${err2.message}`);
              }
            }

            if (!invoiceNumber) {
              const rowText = await row.textContent().catch(() => 'Could not get row text');
              console.log(`    ⚠ Row ${i + 1}: Skipping - no invoice number found`);
              console.log(`    Row content preview: ${rowText.substring(0, 100)}...`);
              continue;
            }

            const invoiceLink = await row.$eval(
              selectors.closedInvoicesList.invoiceLink,
              el => el.getAttribute('href')
            ).catch(() => null);

            // Extract date
            const invoiceDate = await row.$eval(
              selectors.closedInvoicesList.invoiceDate,
              el => el.textContent.replace('▼', '').trim()
            ).catch(() => null);

            // Extract entered by
            const enteredBy = await row.$eval(
              selectors.closedInvoicesList.enteredBy,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract assigned to
            const assignedTo = await row.$eval(
              selectors.closedInvoicesList.assignedTo,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract customer name
            const customerName = await row.$eval(
              selectors.closedInvoicesList.customerName,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract customer link
            const customerLink = await row.$eval(
              selectors.closedInvoicesList.customerName,
              el => el.getAttribute('href')
            ).catch(() => null);

            // Extract type
            const invoiceType = await row.$eval(
              selectors.closedInvoicesList.invoiceType,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract service notes
            const serviceNotes = await row.$eval(
              selectors.closedInvoicesList.serviceNotes,
              el => el.textContent.trim()
            ).catch(() => '');

            // Extract status
            const status = await row.$eval(
              selectors.closedInvoicesList.invoiceStatus,
              el => {
                const className = el.className || '';
                const textContent = el.textContent.trim();
                const result = {
                  className: className,
                  textContent: textContent,
                  status: ''
                };

                if (className.includes('label-info')) {
                  result.status = 'Closed';
                } else if (className.includes('label-warning')) {
                  result.status = 'Pending';
                } else if (className.includes('label-success')) {
                  result.status = 'Completed';
                } else if (className.includes('label-danger')) {
                  result.status = 'Cancelled';
                } else {
                  result.status = textContent;
                }

                return result;
              }
            ).catch((err) => {
              console.log(`    ⚠ Failed to extract status: ${err.message}`);
              return { status: null, className: '', textContent: '' };
            });

            console.log(`    DEBUG ${invoiceNumber}: class="${status.className}" text="${status.textContent}" => status="${status.status}"`);
            const finalStatus = status.status;

            // Check if complete (checkbox checked)
            const isComplete = await row.$eval(
              selectors.closedInvoicesList.complete,
              el => el.checked
            ).catch(() => false);

            // Extract subtotal
            const subtotal = await row.$eval(
              selectors.closedInvoicesList.subtotal,
              el => el.textContent.replace(/[$,]/g, '').trim()
            ).catch(() => '0.00');

            // Extract total
            const total = await row.$eval(
              selectors.closedInvoicesList.invoiceTotal,
              el => el.textContent.replace(/[$,]/g, '').trim()
            ).catch(() => '0.00');

            // Extract date completed
            const dateCompleted = await row.$eval(
              selectors.closedInvoicesList.dateCompleted,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract last modified
            const lastModified = await row.$eval(
              selectors.closedInvoicesList.lastModified,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract arrival time
            const arrivalTime = await row.$eval(
              selectors.closedInvoicesList.arrivalTime,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract departure time
            const departureTime = await row.$eval(
              selectors.closedInvoicesList.departureTime,
              el => el.textContent.trim()
            ).catch(() => null);

            // Extract elapsed time
            const elapsedTime = await row.$eval(
              selectors.closedInvoicesList.elapsedTime,
              el => el.textContent.trim()
            ).catch(() => null);

            invoices.push({
              invoiceNumber,
              invoiceDate,
              enteredBy,
              assignedTo,
              customerName,
              customerLink: customerLink ? new URL(customerLink, this.baseUrl).href : null,
              invoiceType,
              serviceNotes,
              status: finalStatus,
              isComplete,
              subtotal,
              total,
              dateCompleted,
              lastModified,
              arrivalTime,
              departureTime,
              elapsedTime,
              detailUrl: invoiceLink ? new URL(invoiceLink, this.baseUrl).href : null
            });
            console.log(`  ✓ Extracted invoice: ${invoiceNumber} - ${customerName} - $${total} - ${finalStatus}`);
          } catch (error) {
            console.warn('  ⚠ Error extracting invoice row:', error.message);
          }
        }

        // Check for next page
        if (invoices.length < limit) {
          const nextButton = await this.page.$(selectors.pagination.nextButton);

          if (nextButton) {
            console.log('Going to next page...');

            // Check for and dismiss any jconfirm dialogs that might be blocking
            try {
              const confirmDialog = await this.page.$('.jconfirm');
              if (confirmDialog) {
                console.log('  Dismissing confirmation dialog...');

                // Try multiple methods to dismiss the dialog
                // Method 1: Look for CANCEL button
                let dismissed = false;
                const cancelButton = await this.page.$('.jconfirm button:has-text("CANCEL"), .jconfirm .btn-default');
                if (cancelButton) {
                  await cancelButton.click();
                  await this.page.waitForTimeout(500);
                  dismissed = true;
                  console.log('  ✓ Dialog dismissed via CANCEL button');
                }

                // Method 2: Press Escape key to close dialog
                if (!dismissed) {
                  await this.page.keyboard.press('Escape');
                  await this.page.waitForTimeout(500);
                  console.log('  ✓ Dialog dismissed via Escape key');
                }
              }
            } catch (err) {
              console.log('  ⚠ Could not dismiss dialog, continuing anyway...');
            }

            await nextButton.click();
            await this.page.waitForTimeout(3000);
            pageCount++;
          } else {
            console.log('No more pages available');
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      }

      console.log(`✓ Fetched ${invoices.length} closed invoices from RouteStar`);
      return invoices;
    } catch (error) {
      console.error('Fetch closed invoices list error:', error.message);
      await this.takeScreenshot('fetch-closed-invoices-list-error');
      throw new Error(`Failed to fetch closed invoices list: ${error.message}`);
    }
  }

  /**
   * Fetch invoice details
   */
  async fetchInvoiceDetails(invoiceUrl) {
    try {
      console.log(`Navigating to invoice details: ${invoiceUrl}`);
      await this.page.goto(invoiceUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // Wait for the line items table to load
      await this.page.waitForSelector(selectors.invoiceDetail.itemsTable, {
        timeout: 30000,
        state: 'visible'
      });

      // Wait a bit for dynamic content to load
      await this.page.waitForTimeout(3000);

      console.log('Extracting invoice details...');

      // Extract line items
      const items = [];
      const masterTable = await this.page.$('div.ht_master');
      if (!masterTable) {
        throw new Error('Could not find invoice items table');
      }

      const itemRows = await masterTable.$$('table.htCore tbody tr');
      console.log(`Found ${itemRows.length} line item rows`);

      for (let i = 0; i < itemRows.length; i++) {
        const row = itemRows[i];

        try {
          // Extract item name - skip if it's "Choose.." (empty row)
          const itemName = await row.$eval(
            selectors.invoiceDetail.itemName,
            el => el.textContent.replace('▼', '').trim()
          ).catch(() => null);

          // Skip empty rows or "Choose.." placeholder rows
          if (!itemName || itemName === 'Choose..') {
            continue;
          }

          const itemDescription = await row.$eval(
            selectors.invoiceDetail.itemDescription,
            el => el.textContent.trim()
          ).catch(() => '');

          const itemQuantity = await row.$eval(
            selectors.invoiceDetail.itemQuantity,
            el => parseFloat(el.textContent.trim().replace(/[^0-9.-]/g, '')) || 0
          ).catch(() => 0);

          const itemRate = await row.$eval(
            selectors.invoiceDetail.itemRate,
            el => el.textContent.replace(/[$,]/g, '').trim()
          ).catch(() => '0.00');

          const itemAmount = await row.$eval(
            selectors.invoiceDetail.itemAmount,
            el => el.textContent.replace(/[$,]/g, '').trim()
          ).catch(() => '0.00');

          const itemClass = await row.$eval(
            selectors.invoiceDetail.itemClass,
            el => el.textContent.replace('▼', '').trim()
          ).catch(() => '');

          const itemWarehouse = await row.$eval(
            selectors.invoiceDetail.itemWarehouse,
            el => el.textContent.replace('▼', '').trim()
          ).catch(() => '');

          const itemTaxCode = await row.$eval(
            selectors.invoiceDetail.itemTaxCode,
            el => el.textContent.replace('▼', '').trim()
          ).catch(() => '');

          const itemLocation = await row.$eval(
            selectors.invoiceDetail.itemLocation,
            el => el.textContent.trim()
          ).catch(() => '');

          items.push({
            name: itemName,
            description: itemDescription,
            quantity: itemQuantity,
            rate: itemRate,
            amount: itemAmount,
            class: itemClass,
            warehouse: itemWarehouse,
            taxCode: itemTaxCode,
            location: itemLocation
          });

          console.log(`  ✓ Extracted item: ${itemName} - Qty: ${itemQuantity} - Amount: $${itemAmount}`);
        } catch (error) {
          console.warn(`  ⚠ Error extracting line item row ${i + 1}:`, error.message);
        }
      }

      // Extract totals
      const subtotal = await this.page.$eval(
        selectors.invoiceDetail.subtotal,
        el => el.value.replace(/[$,]/g, '').trim()
      ).catch(() => '0.00');

      const tax = await this.page.$eval(
        selectors.invoiceDetail.tax,
        el => el.value.replace(/[$,]/g, '').trim()
      ).catch(() => '0.00');

      const total = await this.page.$eval(
        selectors.invoiceDetail.total,
        el => el.value.replace(/[$,]/g, '').trim()
      ).catch(() => '0.00');

      // Extract other fields
      const signedBy = await this.page.$eval(
        selectors.invoiceDetail.signedBy,
        el => el.value.trim()
      ).catch(() => '');

      const invoiceMemo = await this.page.$eval(
        selectors.invoiceDetail.invoiceMemo,
        el => el.value.trim()
      ).catch(() => '');

      const serviceNotes = await this.page.$eval(
        selectors.invoiceDetail.serviceNotes,
        el => el.value.trim()
      ).catch(() => '');

      const salesTaxRate = await this.page.$eval(
        selectors.invoiceDetail.salesTaxRate,
        el => {
          const selectedOption = el.options[el.selectedIndex];
          return selectedOption ? selectedOption.textContent.trim() : '';
        }
      ).catch(() => '');

      console.log(`✓ Extracted ${items.length} line items`);
      console.log(`  Subtotal: $${subtotal}, Tax: $${tax}, Total: $${total}`);

      return {
        items,
        subtotal,
        tax,
        total,
        signedBy,
        invoiceMemo,
        serviceNotes,
        salesTaxRate
      };
    } catch (error) {
      console.error('Fetch invoice details error:', error.message);
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
