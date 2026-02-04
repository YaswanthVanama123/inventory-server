/**
 * Test script for CustomerConnect automation
 *
 * This script tests the complete flow:
 * 1. Login
 * 2. Navigate to orders
 * 3. Fetch order list
 * 4. Fetch details for first order
 *
 * Run with: node test-customerconnect.js
 */

// Load environment variables from .env file
require('dotenv').config();

const CustomerConnectAutomation = require('./src/automation/customerconnect');

async function test() {
  const automation = new CustomerConnectAutomation();

  try {
    console.log('========================================');
    console.log('CustomerConnect Automation Test');
    console.log('========================================\n');

    // Step 1: Initialize browser
    console.log('Step 1: Initializing browser...');
    await automation.init();
    console.log('✓ Browser initialized\n');

    // Step 2: Login
    console.log('Step 2: Logging in...');
    await automation.login();
    console.log('✓ Login successful\n');

    // Wait a bit to see the logged-in page
    await automation.page.waitForTimeout(2000);

    // Step 3: Fetch order list from multiple pages
    console.log('Step 3: Fetching orders from first 3 pages (up to 30 orders)...');
    const startTime = Date.now();
    const result = await automation.fetchOrdersList(30);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    const orders = result.orders;
    const pagination = result.pagination;

    console.log(`✓ Fetched ${orders.length} orders in ${duration} seconds\n`);

    // Display comprehensive pagination statistics
    console.log('========================================');
    console.log('📊 EXTRACTION STATISTICS');
    console.log('========================================');
    console.log(`\n📦 Total Orders in System: ${pagination.totalOrders}`);
    console.log(`📄 Total Pages Available: ${pagination.totalPages}`);
    console.log(`\n✅ Fetched Orders: ${pagination.fetchedOrders}`);
    console.log(`✅ Fetched Pages: ${pagination.fetchedPages}`);
    console.log(`\n⏳ Remaining Orders: ${pagination.remainingOrders}`);
    console.log(`⏳ Remaining Pages: ${pagination.remainingPages}`);
    console.log(`\n⏱️  Time Taken: ${duration} seconds`);
    console.log(`⚡ Average per order: ${(duration / orders.length).toFixed(2)} seconds`);
    console.log(`⚡ Average per page: ${(duration / pagination.fetchedPages).toFixed(2)} seconds`);
    console.log('========================================\n');

    // Display orders grouped by page
    console.log('========================================');
    console.log(`ALL EXTRACTED ORDERS (${orders.length} total)`);
    console.log('========================================\n');

    // Group and display by page
    const ordersPerPage = 10;
    for (let page = 0; page < pagination.fetchedPages; page++) {
      const pageStart = page * ordersPerPage;
      const pageEnd = Math.min(pageStart + ordersPerPage, orders.length);
      const pageOrders = orders.slice(pageStart, pageEnd);

      console.log(`--- PAGE ${page + 1} of ${pagination.totalPages} (${pageOrders.length} orders) ---\n`);

      pageOrders.forEach((order, index) => {
        const overallIndex = pageStart + index + 1;
        console.log(`${overallIndex}. Order #${order.orderNumber}`);
        console.log(`   Date:   ${order.orderDate}`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Total:  $${order.total}`);
        console.log(`   Vendor: ${order.vendorName}`);
        console.log(`   PO:     ${order.poNumber}`);
        console.log('');
      });
    }

    // Skip detailed order fetching for now - focus on list extraction
    console.log('========================================');
    console.log('✅ PAGINATION TEST COMPLETED SUCCESSFULLY');
    console.log('========================================\n');

    console.log('Final Summary:');
    console.log(`✓ Total orders in system: ${pagination.totalOrders}`);
    console.log(`✓ Successfully extracted: ${pagination.fetchedOrders} orders from ${pagination.fetchedPages} pages`);
    console.log(`✓ Remaining to extract: ${pagination.remainingOrders} orders from ${pagination.remainingPages} pages`);
    console.log(`✓ Pagination working: ${pagination.fetchedPages >= 3 ? 'YES ✅' : 'PARTIAL (fewer pages available)'}`);
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
