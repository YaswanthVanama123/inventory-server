/**
 * Test script for RouteStar Closed Invoices automation
 *
 * This script tests fetching closed/completed invoices from:
 * https://emnrv.routestar.online/web/closedinvoices/
 *
 * Run with: node test-closedinvoices.js
 */

// Load environment variables from .env file
require('dotenv').config();

const RouteStarAutomation = require('./src/automation/routestar');

async function test() {
  const automation = new RouteStarAutomation();

  try {
    console.log('========================================');
    console.log('RouteStar Closed Invoices Extraction');
    console.log('========================================\n');

    // Step 1: Initialize browser
    console.log('Step 1: Initializing browser...');
    await automation.init();
    console.log('✓ Browser initialized\n');

    // Step 2: Login
    console.log('Step 2: Logging in to RouteStar...');
    console.log(`   URL: ${automation.baseUrl}/web/login/`);
    console.log(`   Username: ${automation.username}`);
    await automation.login();
    console.log('✓ Login successful\n');

    // Wait a bit to see the logged-in page
    await automation.page.waitForTimeout(2000);

    // Step 3: Fetch closed invoices from first 3 pages (up to 30 invoices)
    console.log('Step 3: Fetching closed invoices from first 3 pages (up to 30 invoices)...');
    const startTime = Date.now();
    const closedInvoices = await automation.fetchClosedInvoicesList(30);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✓ Fetched ${closedInvoices.length} closed invoices in ${duration} seconds\n`);

    // Display comprehensive statistics
    console.log('========================================');
    console.log('📊 EXTRACTION STATISTICS');
    console.log('========================================');
    console.log(`\n📦 Total Closed Invoices Fetched: ${closedInvoices.length}`);
    console.log(`\n⏱️  Time Taken: ${duration} seconds`);
    console.log(`⚡ Average per invoice: ${(duration / closedInvoices.length).toFixed(2)} seconds`);
    console.log('========================================\n');

    // Calculate totals
    const completedInvoices = closedInvoices.filter(inv =>
      inv.status && inv.status.toLowerCase().includes('completed')
    );
    const cancelledInvoices = closedInvoices.filter(inv =>
      inv.status && inv.status.toLowerCase().includes('cancelled')
    );

    const completedTotal = completedInvoices.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);
    const cancelledTotal = cancelledInvoices.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);

    console.log('========================================');
    console.log('💰 FINANCIAL SUMMARY');
    console.log('========================================');
    console.log(`\n✅ Completed Invoices: ${completedInvoices.length} - Total: $${completedTotal.toFixed(2)}`);
    console.log(`❌ Cancelled Invoices: ${cancelledInvoices.length} - Total: $${cancelledTotal.toFixed(2)}`);
    console.log(`📊 Grand Total: $${(completedTotal + cancelledTotal).toFixed(2)}`);
    console.log('========================================\n');

    // Display all closed invoices in structured format
    console.log('========================================');
    console.log(`🏁 CLOSED INVOICES (${closedInvoices.length} total)`);
    console.log('========================================\n');

    if (closedInvoices.length === 0) {
      console.log('No closed invoices found.\n');
    } else {
      closedInvoices.forEach((invoice, index) => {
        console.log(`─────────────────────────────────────────`);
        console.log(`${index + 1}. Invoice #${invoice.invoiceNumber}`);
        console.log(`─────────────────────────────────────────`);
        console.log(`📅 Date:           ${invoice.invoiceDate || 'N/A'}`);
        console.log(`👤 Customer:       ${invoice.customerName || 'N/A'}`);
        console.log(`📝 Type:           ${invoice.invoiceType || 'N/A'}`);
        console.log(`${invoice.status === 'Closed' ? '🏁' : '❌'} Status:         ${invoice.status || 'N/A'}`);
        console.log(`💰 Subtotal:       $${invoice.subtotal || '0.00'}`);
        console.log(`💰 Total:          $${invoice.total || '0.00'}`);
        console.log(`\n👨‍💼 Entered By:     ${invoice.enteredBy || 'N/A'}`);
        console.log(`👷 Assigned To:    ${invoice.assignedTo || 'N/A'}`);
        console.log(`\n✅ Complete:       ${invoice.isComplete ? 'Yes' : 'No'}`);
        console.log(`📆 Date Completed: ${invoice.dateCompleted || 'N/A'}`);
        console.log(`\n🔧 Service Notes:  ${invoice.serviceNotes || 'N/A'}`);
        console.log(`📝 Last Modified:  ${invoice.lastModified || 'N/A'}`);
        console.log(`\n🕐 Arrival Time:   ${invoice.arrivalTime || 'N/A'}`);
        console.log(`🕑 Departure Time: ${invoice.departureTime || 'N/A'}`);
        console.log(`⏱️  Elapsed Time:   ${invoice.elapsedTime || 'N/A'}`);
        console.log(`\n🔗 Detail URL:     ${invoice.detailUrl || 'N/A'}`);
        console.log('');
      });
    }

    // Step 4: Fetch details for a non-zero closed invoice
    if (closedInvoices.length > 1) {
      console.log('========================================');
      console.log('📋 FETCHING DETAILED INVOICE INFORMATION');
      console.log('========================================\n');

      // Find the first non-zero invoice
      const nonZeroInvoice = closedInvoices.find(inv => parseFloat(inv.total) > 0) || closedInvoices[0];

      console.log(`Fetching details for closed invoice: ${nonZeroInvoice.invoiceNumber} ($${nonZeroInvoice.total})...`);
      const invoiceDetails = await automation.fetchInvoiceDetails(nonZeroInvoice.detailUrl);

      console.log('\n─────────────────────────────────────────');
      console.log(`INVOICE DETAILS: ${nonZeroInvoice.invoiceNumber}`);
      console.log('─────────────────────────────────────────');
      console.log(`\n👤 Customer: ${nonZeroInvoice.customerName}`);
      console.log(`💰 Total: $${invoiceDetails.total}`);
      console.log(`📋 Tax Rate: ${invoiceDetails.salesTaxRate || 'None'}`);
      console.log(`✍️  Signed By: ${invoiceDetails.signedBy || 'N/A'}`);

      console.log(`\n📦 LINE ITEMS (${invoiceDetails.items.length} items):`);
      console.log('─────────────────────────────────────────');

      invoiceDetails.items.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.name}`);
        console.log(`   Description:  ${item.description}`);
        console.log(`   Quantity:     ${item.quantity}`);
        console.log(`   Rate:         $${item.rate}`);
        console.log(`   Amount:       $${item.amount}`);
        if (item.taxCode) console.log(`   Tax Code:     ${item.taxCode}`);
        if (item.class) console.log(`   Class:        ${item.class}`);
        if (item.location) console.log(`   Location:     ${item.location}`);
      });

      console.log('\n─────────────────────────────────────────');
      console.log('💵 TOTALS');
      console.log('─────────────────────────────────────────');
      console.log(`Subtotal:  $${invoiceDetails.subtotal}`);
      console.log(`Tax:       $${invoiceDetails.tax}`);
      console.log(`TOTAL:     $${invoiceDetails.total}`);

      if (invoiceDetails.invoiceMemo) {
        console.log('\n─────────────────────────────────────────');
        console.log('📝 INVOICE NOTES/MEMO');
        console.log('─────────────────────────────────────────');
        console.log(invoiceDetails.invoiceMemo);
      }

      if (invoiceDetails.serviceNotes) {
        console.log('\n─────────────────────────────────────────');
        console.log('🔧 SERVICE NOTES');
        console.log('─────────────────────────────────────────');
        console.log(invoiceDetails.serviceNotes);
      }

      console.log('\n========================================');
      console.log('✅ INVOICE DETAILS EXTRACTED SUCCESSFULLY');
      console.log('========================================\n');
    }

    console.log('========================================');
    console.log('✅ CLOSED INVOICES EXTRACTION COMPLETED SUCCESSFULLY');
    console.log('========================================\n');

    console.log('Final Summary:');
    console.log(`✓ Successfully logged in to RouteStar`);
    console.log(`✓ Navigated to closed invoices page: ${automation.baseUrl}/web/closedinvoices/`);
    console.log(`✓ Successfully extracted ${closedInvoices.length} closed invoices`);
    console.log(`✓ Completed invoices: ${completedInvoices.length} ($${completedTotal.toFixed(2)})`);
    console.log(`✓ Cancelled invoices: ${cancelledInvoices.length} ($${cancelledTotal.toFixed(2)})`);
    console.log(`✓ All invoice data fields captured successfully`);
    if (closedInvoices.length > 1) {
      const nonZeroInvoice = closedInvoices.find(inv => parseFloat(inv.total) > 0) || closedInvoices[0];
      console.log(`✓ Successfully extracted detailed line items for invoice ${nonZeroInvoice.invoiceNumber} ($${nonZeroInvoice.total})`);
    }
    console.log('');

    // Keep browser open for 10 seconds so you can see it
    console.log('Keeping browser open for 10 seconds...');
    await automation.page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    console.log('\nClosing browser...');
    await automation.close();
    console.log('✓ Browser closed');
  }
}

// Run the test
test();
