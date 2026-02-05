/**
 * Test script for Inventory Scheduler
 *
 * This script tests the complete inventory sync scheduler
 * that runs CustomerConnect orders sync and RouteStar invoices sync
 *
 * Run with: npm run test:scheduler.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { getInventoryScheduler } = require('../src/services/inventoryScheduler.service');

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
 * Main test function
 */
async function test() {
  try {
    console.log('════════════════════════════════════════');
    console.log('  Inventory Scheduler Test');
    console.log('════════════════════════════════════════\n');

    // Connect to database
    await connectDatabase();

    // Get scheduler instance
    const scheduler = getInventoryScheduler();

    console.log('📊 Initial Scheduler Status:');
    console.log(scheduler.getStatus());
    console.log('');

    // Option 1: Run sync immediately
    console.log('Choose test option:');
    console.log('1. Run sync immediately (one-time)');
    console.log('2. Start scheduler (runs at 3 AM daily)');
    console.log('3. Test with custom schedule (every 1 minute for testing)\n');

    const option = process.argv[2] || '1';

    if (option === '1') {
      console.log('🔄 Running immediate sync...\n');
      const results = await scheduler.runNow({
        ordersLimit: 50,
        invoicesLimit: 50,
        processStock: true
      });

      console.log('\n📊 Sync Results:');
      console.log(JSON.stringify(results, null, 2));
    } else if (option === '2') {
      console.log('🕐 Starting scheduler with 3 AM daily schedule...\n');
      scheduler.start({
        cronExpression: '0 3 * * *',
        ordersLimit: 100,
        invoicesLimit: 100,
        processStock: true,
        timezone: process.env.TZ || 'America/New_York'
      });

      console.log('\n📊 Scheduler Status:');
      console.log(scheduler.getStatus());

      console.log('\n⚠️  Scheduler is running. Press Ctrl+C to stop.\n');
      console.log('Next sync will run at 3:00 AM.');
      console.log('Use option 1 to test sync immediately instead.\n');

      // Keep process alive
      process.stdin.resume();
    } else if (option === '3') {
      console.log('🕐 Starting scheduler with 1-minute interval for testing...\n');
      console.log('⚠️  WARNING: This will run sync every minute. Use only for testing!\n');

      scheduler.start({
        cronExpression: '* * * * *', // Every minute
        ordersLimit: 10,
        invoicesLimit: 10,
        processStock: true,
        timezone: process.env.TZ || 'America/New_York'
      });

      console.log('\n📊 Scheduler Status:');
      console.log(scheduler.getStatus());

      console.log('\n⚠️  Scheduler is running. Press Ctrl+C to stop.\n');
      console.log('Sync will run every minute. Check logs for progress.\n');

      // Keep process alive
      process.stdin.resume();
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Only close if option 1 (immediate sync)
    if (process.argv[2] === '1' || !process.argv[2]) {
      console.log('\nClosing database connection...');
      await mongoose.connection.close();
      console.log('✓ Database closed\n');
      process.exit(0);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nStopping scheduler...');
  const scheduler = getInventoryScheduler();
  scheduler.stop();

  console.log('Closing database connection...');
  await mongoose.connection.close();
  console.log('✓ Cleanup complete\n');
  process.exit(0);
});

// Run the test
test();
