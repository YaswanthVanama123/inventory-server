const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const RouteStarSyncService = require('./src/services/routeStarSync.service');

async function test() {
  const syncService = new RouteStarSyncService();
  try {
    console.log('🚀 Starting items sync test...\n');

    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected\n');

    await syncService.init();

    
    const results = await syncService.syncItems(Infinity);

    console.log('\n' + '='.repeat(80));
    console.log('✅ ITEMS SYNC COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log('\n📊 Final Summary:');
    console.log(`   📥 Total Items Fetched:  ${results.total}`);
    console.log(`   ✨ New Items Created:    ${results.created}`);
    console.log(`   🔄 Items Updated:        ${results.updated}`);
    console.log(`   ⊘  Items Skipped:        ${results.skipped}`);
    console.log(`   ❌ Items Failed:         ${results.failed}`);
    console.log('\n' + '='.repeat(80) + '\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await syncService.close();

    
    console.log('\nClosing MongoDB connection...');
    await mongoose.connection.close();
    console.log('✓ MongoDB closed');

    process.exit(0);
  }
}

test();
