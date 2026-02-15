




require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';




const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || '';

const api = axios.create({
  baseURL: BASE_URL,
  headers: AUTH_TOKEN ? {
    'Authorization': `Bearer ${AUTH_TOKEN}`
  } : {}
});

async function testEndpoints() {
  console.log('\n========================================');
  console.log('API Endpoints Test Suite');
  console.log('========================================\n');

  let testsPassed = 0;
  let testsFailed = 0;

  
  console.log('Test 1: Get CustomerConnect Order Range');
  console.log('─'.repeat(50));
  try {
    const response = await api.get('/api/customerconnect/order-range');
    if (response.data.success) {
      console.log('✓ Order range retrieved successfully');
      console.log(`  Highest order: #${response.data.data.highest}`);
      console.log(`  Lowest order: #${response.data.data.lowest}`);
      console.log(`  Total orders: ${response.data.data.totalOrders}`);
      testsPassed++;
    } else {
      console.log('✗ Request succeeded but returned success: false');
      testsFailed++;
    }
  } catch (error) {
    console.log('✗ Failed:', error.response?.data?.message || error.message);
    if (error.response?.status === 401) {
      console.log('  ⚠️  Authentication required. Set TEST_AUTH_TOKEN in .env');
    }
    testsFailed++;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  
  console.log('\nTest 2: Get RouteStar Invoice Range');
  console.log('─'.repeat(50));
  try {
    const response = await api.get('/api/routestar/invoice-range');
    if (response.data.success) {
      console.log('✓ Invoice range retrieved successfully');
      console.log(`  Highest invoice: #${response.data.data.highest}`);
      console.log(`  Lowest invoice: #${response.data.data.lowest}`);
      console.log(`  Total invoices: ${response.data.data.totalInvoices}`);
      testsPassed++;
    } else {
      console.log('✗ Request succeeded but returned success: false');
      testsFailed++;
    }
  } catch (error) {
    console.log('✗ Failed:', error.response?.data?.message || error.message);
    testsFailed++;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  
  console.log('\nTest 3: Get Scheduler Status');
  console.log('─'.repeat(50));
  try {
    const response = await api.get('/api/scheduler/status');
    if (response.data.success) {
      console.log('✓ Scheduler status retrieved successfully');
      console.log(`  Running: ${response.data.data.isRunning}`);
      console.log(`  Sync in progress: ${response.data.data.syncInProgress}`);
      if (response.data.data.lastRun.customerConnect) {
        console.log(`  Last CC run: ${new Date(response.data.data.lastRun.customerConnect).toLocaleString()}`);
      }
      testsPassed++;
    } else {
      console.log('✗ Request succeeded but returned success: false');
      testsFailed++;
    }
  } catch (error) {
    console.log('✗ Failed:', error.response?.data?.message || error.message);
    testsFailed++;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  
  if (AUTH_TOKEN) {
    console.log('\nTest 4: CustomerConnect Orders Sync (limit: 5)');
    console.log('─'.repeat(50));
    console.log('⚠️  This will actually run automation! Press Ctrl+C to cancel...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      console.log('Starting sync...');
      const response = await api.post('/api/customerconnect/sync/orders', {
        limit: 5
      });

      if (response.data.success) {
        console.log('✓ Sync completed successfully!');
        console.log(`  Synced: ${response.data.data.synced}`);
        console.log(`  Created: ${response.data.data.created}`);
        console.log(`  Updated: ${response.data.data.updated}`);
        testsPassed++;
      } else {
        console.log('✗ Sync request succeeded but returned success: false');
        testsFailed++;
      }
    } catch (error) {
      console.log('✗ Sync failed:', error.response?.data?.message || error.message);
      testsFailed++;
    }
  } else {
    console.log('\nTest 4: CustomerConnect Sync - Skipped (no auth token)');
    console.log('─'.repeat(50));
    console.log('⚠️  Set TEST_AUTH_TOKEN to test actual sync');
  }

  
  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================');
  console.log(`✓ Passed: ${testsPassed}`);
  console.log(`✗ Failed: ${testsFailed}`);
  console.log(`  Total: ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log('\n✅ All tests passed! API endpoints are working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
  }
  console.log('========================================\n');

  if (!AUTH_TOKEN) {
    console.log('💡 Tip: To test authenticated endpoints:');
    console.log('   1. Login to the webapp');
    console.log('   2. Copy JWT token from browser localStorage');
    console.log('   3. Set TEST_AUTH_TOKEN="your-token" in .env');
    console.log('   4. Run this test again\n');
  }
}


async function checkServer() {
  try {
    await axios.get(`${BASE_URL}/api/health`);
    return true;
  } catch (error) {
    console.error('\n❌ Server is not running!');
    console.error(`   Make sure server is running on ${BASE_URL}`);
    console.error(`   Run: npm start\n`);
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }

  await testEndpoints();
}

main().catch(console.error);
