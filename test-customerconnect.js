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

    // Step 3: Fetch order list
    console.log('Step 3: Fetching all orders from first page (10 orders)...');
    const orders = await automation.fetchOrdersList(10);
    console.log(`✓ Fetched ${orders.length} orders\n`);

    // Display orders
    console.log('========================================');
    console.log(`All Orders from First Page (${orders.length} orders):`);
    console.log('========================================\n');
    orders.forEach((order, index) => {
      console.log(`${index + 1}. Order #${order.orderNumber}`);
      console.log(`   Date:   ${order.orderDate}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Total:  $${order.total}`);
      console.log(`   Vendor: ${order.vendorName}`);
      console.log(`   PO:     ${order.poNumber}`);
      console.log(`   URL:    ${order.detailUrl}`);
      console.log('');
    });

    // Step 4: Fetch details for first order
    if (orders.length > 0) {
      console.log('\n========================================');
      console.log('Step 4: Fetching details for first order...');
      const details = await automation.fetchOrderDetails(orders[0].detailUrl);
      console.log('✓ Order details fetched\n');

      console.log('Order Details:');
      console.log(`  Order #: ${details.orderNumber}`);
      console.log(`  PO #: ${details.poNumber}`);
      console.log(`  Date: ${details.orderDate}`);
      console.log(`  Status: ${details.status}`);
      console.log(`\n  Line Items (${details.items.length}):`);
      details.items.forEach((item, index) => {
        console.log(`    ${index + 1}. ${item.name}`);
        console.log(`       SKU: ${item.sku}`);
        console.log(`       Qty: ${item.qty} @ $${item.unitPrice} = $${item.lineTotal}`);
      });
      console.log(`\n  Subtotal: $${details.subtotal}`);
      console.log(`  Tax: $${details.tax}`);
      console.log(`  Shipping: $${details.shipping}`);
      console.log(`  Total: $${details.total}`);
    }

    console.log('\n========================================');
    console.log('✓ TEST COMPLETED SUCCESSFULLY');
    console.log('========================================\n');

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
