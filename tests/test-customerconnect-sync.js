/**
 * Test script for CustomerConnect Sync Service
 *
 * This script demonstrates the full sync process:
 * 1. Sync orders from CustomerConnect
 * 2. Sync order details (line items) for orders without details
 * 3. Process stock movements (add inventory for received orders)
 *
 * Run with: npm run test:customerconnect-sync.js
 */

// Load environment variables from .env file
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Database connection
const mongoose = require('mongoose');

// Services and Models
const CustomerConnectSyncService = require('../src/services/customerConnectSync.service');
const CustomerConnectOrder = require('../src/models/CustomerConnectOrder');

/**
 * Connect to MongoDB
 */
async function connectDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✓ MongoDB connected\n');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Display sync statistics
 */
function displayStats(results) {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║       SYNC STATISTICS SUMMARY          ║');
  console.log('╠════════════════════════════════════════╣');

  if (results.orders) {
    console.log('║ ORDERS:                                ║');
    console.log(`║   Created:  ${String(results.orders.created).padStart(4)} orders             ║`);
    console.log(`║   Updated:  ${String(results.orders.updated).padStart(4)} orders             ║`);
    console.log(`║   Skipped:  ${String(results.orders.skipped).padStart(4)} orders             ║`);
    console.log(`║   Total:    ${String(results.orders.total).padStart(4)} orders             ║`);
    console.log('╠════════════════════════════════════════╣');

    if (results.orders.pagination) {
      console.log('║ PAGINATION INFO:                       ║');
      console.log(`║   Available: ${String(results.orders.pagination.totalOrders).padStart(3)} total orders      ║`);
      console.log(`║   Pages:     ${String(results.orders.pagination.totalPages).padStart(3)} total pages       ║`);
      console.log(`║   Remaining: ${String(results.orders.pagination.remainingOrders).padStart(3)} orders            ║`);
      console.log('╠════════════════════════════════════════╣');
    }
  }

  if (results.details) {
    console.log('║ ORDER DETAILS:                         ║');
    console.log(`║   Synced:    ${String(results.details.synced).padStart(3)} orders             ║`);
    console.log(`║   Skipped:   ${String(results.details.skipped).padStart(3)} orders             ║`);
    console.log(`║   Total:     ${String(results.details.total).padStart(3)} orders             ║`);
    console.log('╠════════════════════════════════════════╣');
  }

  if (results.stock) {
    console.log('║ STOCK MOVEMENTS:                       ║');
    console.log(`║   Processed: ${String(results.stock.processed).padStart(3)} orders             ║`);
    console.log(`║   Skipped:   ${String(results.stock.skipped).padStart(3)} orders             ║`);
    console.log(`║   Total:     ${String(results.stock.total).padStart(3)} orders             ║`);
  }

  console.log('╚════════════════════════════════════════╝\n');
}

/**
 * Display order summary from database
 */
async function displayOrderSummary() {
  console.log('\n📊 DATABASE ORDER SUMMARY');
  console.log('═══════════════════════════════════════');

  // Total count
  const totalCount = await CustomerConnectOrder.countDocuments();
  console.log(`\n📦 Total Orders: ${totalCount}`);

  // Count by status
  const statusCounts = await CustomerConnectOrder.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  console.log(`\n📊 Status Breakdown:`);
  statusCounts.forEach(item => {
    console.log(`  - ${item._id}: ${item.count}`);
  });

  // Stock processing status
  const stockProcessed = await CustomerConnectOrder.countDocuments({ stockProcessed: true });
  const stockUnprocessed = await CustomerConnectOrder.countDocuments({ stockProcessed: false });

  console.log(`\n📦 Stock Processing Status:`);
  console.log(`  - Processed:   ${stockProcessed}`);
  console.log(`  - Unprocessed: ${stockUnprocessed}`);

  // Orders with/without details
  const withDetails = await CustomerConnectOrder.countDocuments({ 'items.0': { $exists: true } });
  const withoutDetails = await CustomerConnectOrder.countDocuments({
    $or: [
      { items: { $exists: false } },
      { items: { $size: 0 } }
    ]
  });

  console.log(`\n📋 Order Details Status:`);
  console.log(`  - With Line Items:    ${withDetails}`);
  console.log(`  - Without Line Items: ${withoutDetails}`);

  // Purchase stats (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const purchaseStats = await CustomerConnectOrder.getPurchaseStats(thirtyDaysAgo, new Date());

  console.log(`\n💰 Purchase Stats (Last 30 Days):`);
  console.log(`  - Total Purchases: $${purchaseStats.totalPurchases.toFixed(2)}`);
  console.log(`  - Total Orders:    ${purchaseStats.totalOrders}`);
  console.log(`  - Average Value:   $${purchaseStats.averageOrderValue.toFixed(2)}`);
  console.log(`  - Subtotal:        $${purchaseStats.totalSubtotal.toFixed(2)}`);
  console.log(`  - Tax:             $${purchaseStats.totalTax.toFixed(2)}`);
  console.log(`  - Shipping:        $${purchaseStats.totalShipping.toFixed(2)}`);

  // Top vendors
  const topVendors = await CustomerConnectOrder.getTopVendors(thirtyDaysAgo, new Date(), 5);

  console.log(`\n🏢 Top 5 Vendors (Last 30 Days):`);
  topVendors.forEach((vendor, index) => {
    console.log(`  ${index + 1}. ${vendor._id || 'Unknown'}`);
    console.log(`     Purchases: $${vendor.totalPurchases.toFixed(2)} (${vendor.orderCount} orders)`);
  });

  // Top products
  const topProducts = await CustomerConnectOrder.getTopProducts(thirtyDaysAgo, new Date(), 5);

  console.log(`\n📦 Top 5 Products (Last 30 Days):`);
  topProducts.forEach((product, index) => {
    console.log(`  ${index + 1}. ${product._id.name} (${product._id.sku})`);
    console.log(`     Quantity: ${product.totalQuantity} units | Value: $${product.totalValue.toFixed(2)}`);
  });

  console.log('\n═══════════════════════════════════════\n');
}

/**
 * Main test function
 */
async function test() {
  let syncService = null;

  try {
    console.log('════════════════════════════════════════');
    console.log('  CustomerConnect Sync Service Test');
    console.log('════════════════════════════════════════\n');

    // Connect to database
    await connectDatabase();

    // Initialize sync service
    console.log('Initializing CustomerConnect sync service...');
    syncService = new CustomerConnectSyncService();
    await syncService.init();
    console.log('✓ Sync service initialized\n');

    // Run full sync
    const results = await syncService.fullSync({
      ordersLimit: 50,      // Fetch up to 50 orders
      detailsLimit: 20,     // Fetch details for up to 20 orders without line items
      processStock: true    // Process stock movements (ADD to inventory)
    });

    // Display statistics
    displayStats(results);

    // Display database summary
    await displayOrderSummary();

    console.log('✅ TEST COMPLETED SUCCESSFULLY\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Close automation
    if (syncService) {
      console.log('\nClosing CustomerConnect automation...');
      await syncService.close();
      console.log('✓ Automation closed');
    }

    // Close database connection
    console.log('Closing database connection...');
    await mongoose.connection.close();
    console.log('✓ Database closed\n');
  }
}

// Run the test
test();
