/**
 * CustomerConnect Full Sync Test
 *
 * This script performs a complete sync using the existing sync service:
 * 1. Login to CustomerConnect
 * 2. Fetch ALL orders from ALL pages
 * 3. Fetch details for EACH order
 * 4. Save/Update to database
 * 5. Process stock movements
 *
 * Run with: npm run test:customerconnect
 */

// Load environment variables from .env file
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const CustomerConnectSyncService = require('../src/services/customerConnectSync.service');

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory');
    console.log('✓ Connected to MongoDB\n');
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

async function test() {
  const syncService = new CustomerConnectSyncService();

  try {
    console.log('========================================');
    console.log('CustomerConnect Full Sync Test');
    console.log('========================================\n');

    // Step 1: Connect to Database
    console.log('Step 1: Connecting to database...');
    await connectDatabase();

    // Step 2: Initialize automation
    console.log('Step 2: Initializing automation (browser + login)...');
    await syncService.init();
    console.log('✓ Automation initialized\n');

    // Step 3: Run full sync (fetches ALL orders, details, and updates stock)
    console.log('Step 3: Running full sync...');
    console.log('   - Fetching ALL orders');
    console.log('   - Fetching details for each order');
    console.log('   - Updating database');
    console.log('   - Processing stock movements');
    console.log('   (This will take a while...)\n');

    const startTime = Date.now();

    const results = await syncService.fullSync({
      ordersLimit: Infinity,          // Fetch ALL orders
      detailsLimit: Infinity,         // Fetch details for ALL orders without details
      forceRefetchDetails: true,      // Set to TRUE to re-fetch details for orders that already have them
      processStock: true              // Update inventory stock
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Display results
    console.log('\n========================================');
    console.log('✅ FULL SYNC COMPLETED');
    console.log('========================================\n');

    console.log('📊 Orders Sync:');
    console.log(`   Total fetched:    ${results.orders.total}`);
    console.log(`   Created in DB:    ${results.orders.created}`);
    console.log(`   Updated in DB:    ${results.orders.updated}`);
    console.log(`   Skipped/Failed:   ${results.orders.skipped}`);
    console.log('');

    console.log('📦 Order Details Sync:');
    console.log(`   Details fetched:  ${results.details.synced}`);
    console.log(`   Skipped:          ${results.details.skipped}`);
    console.log(`   Total orders:     ${results.details.total}`);
    console.log('');

    if (results.stock) {
      console.log('📈 Stock Processing:');
      console.log(`   Orders processed: ${results.stock.processed}`);
      console.log(`   Skipped:          ${results.stock.skipped}`);
      console.log(`   Total:            ${results.stock.total}`);
      console.log('');
    }

    console.log('⏱️  Performance:');
    console.log(`   Total time:       ${duration}s`);
    if (results.orders.total > 0) {
      console.log(`   Avg per order:    ${(parseFloat(duration) / results.orders.total).toFixed(2)}s`);
    }
    console.log('');

    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    console.log('Closing automation...');
    await syncService.close();
    console.log('✓ Automation closed\n');

    console.log('Closing database connection...');
    await mongoose.connection.close();
    console.log('✓ Database closed');
  }
}

// Run the test
test();
