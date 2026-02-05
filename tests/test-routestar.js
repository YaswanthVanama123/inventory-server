/**
 * RouteStar Full Sync Test
 *
 * This script performs a complete sync using the existing sync service:
 * 1. Login to RouteStar
 * 2. Fetch ALL pending invoices from ALL pages
 * 3. Fetch ALL closed invoices from ALL pages
 * 4. Fetch details for EACH invoice
 * 5. Save/Update to database
 * 6. Process stock movements
 *
 * Run with: npm run test:routestar
 */

// Load environment variables from .env file
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const RouteStarSyncService = require('../src/services/routeStarSync.service');

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory');
    console.log('✓ Connected to MongoDB\n');
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

async function test() {
  const syncService = new RouteStarSyncService();

  try {
    console.log('========================================');
    console.log('RouteStar Full Sync Test');
    console.log('========================================\n');

    // Step 1: Connect to Database
    console.log('Step 1: Connecting to database...');
    await connectDatabase();

    // Step 2: Initialize automation
    console.log('Step 2: Initializing automation (browser + login)...');
    await syncService.init();
    console.log('✓ Automation initialized\n');

    // Step 3: Run full sync (fetches ALL invoices, details, and updates stock)
    console.log('Step 3: Running full sync...');
    console.log('   - Fetching ALL pending invoices');
    console.log('   - Fetching ALL closed invoices');
    console.log('   - Fetching details for each invoice');
    console.log('   - Updating database');
    console.log('   - Processing stock movements');
    console.log('   (This will take a while...)\n');

    const startTime = Date.now();

    const results = await syncService.fullSync({
      pendingLimit: Infinity,     // Fetch ALL pending invoices
      closedLimit: Infinity,      // Fetch ALL closed invoices
      detailsLimit: Infinity,     // Fetch details for ALL invoices
      processStock: true          // Update inventory stock
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Display results
    console.log('\n========================================');
    console.log('✅ FULL SYNC COMPLETED');
    console.log('========================================\n');

    console.log('📊 Pending Invoices Sync:');
    console.log(`   Total fetched:    ${results.pending.total}`);
    console.log(`   Created in DB:    ${results.pending.created}`);
    console.log(`   Updated in DB:    ${results.pending.updated}`);
    console.log(`   Skipped/Failed:   ${results.pending.skipped}`);
    console.log('');

    console.log('📊 Closed Invoices Sync:');
    console.log(`   Total fetched:    ${results.closed.total}`);
    console.log(`   Created in DB:    ${results.closed.created}`);
    console.log(`   Updated in DB:    ${results.closed.updated}`);
    console.log(`   Skipped/Failed:   ${results.closed.skipped}`);
    console.log('');

    console.log('📦 Invoice Details Sync:');
    console.log(`   Details fetched:  ${results.details.synced}`);
    console.log(`   Already had:      ${results.details.skipped}`);
    console.log(`   Total invoices:   ${results.details.total}`);
    console.log('');

    if (results.stock) {
      console.log('📈 Stock Processing:');
      console.log(`   Invoices processed: ${results.stock.processed}`);
      console.log(`   Skipped:            ${results.stock.skipped}`);
      console.log(`   Total:              ${results.stock.total}`);
      console.log('');
    }

    console.log('⏱️  Performance:');
    console.log(`   Total time:       ${duration}s`);
    const totalInvoices = results.pending.total + results.closed.total;
    if (totalInvoices > 0) {
      console.log(`   Avg per invoice:  ${(parseFloat(duration) / totalInvoices).toFixed(2)}s`);
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
