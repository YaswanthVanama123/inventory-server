const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const RouteStarSyncService = require('./src/services/routeStarSync.service');

async function test() {
  const syncService = new RouteStarSyncService();
  try {
    console.log('🚀 Starting items sync test...\n');

    // Connect to MongoDB first
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected\n');

    await syncService.init();

    // Fetch 20 items for testing (change to Infinity for all items)
    const results = await syncService.syncItems(20);

    console.log('\n✅ Test completed successfully!');
    console.log('Results:', JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await syncService.close();

    // Close MongoDB connection
    console.log('\nClosing MongoDB connection...');
    await mongoose.connection.close();
    console.log('✓ MongoDB closed');

    process.exit(0);
  }
}

test();
