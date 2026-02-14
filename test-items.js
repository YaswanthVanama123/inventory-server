const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const RouteStarSyncService = require('./src/services/routeStarSync.service');

async function test() {
  const syncService = new RouteStarSyncService();
  try {
    console.log('🚀 Starting items sync test...\n');

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
    process.exit(0);
  }
}

test();
