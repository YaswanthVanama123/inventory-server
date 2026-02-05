require('dotenv').config();
const axios = require('axios');

const BASE_URL = `http://localhost:${process.env.PORT || 5001}/api`;

async function triggerSync() {
  console.log('🚀 Triggering Automation Sync...\n');

  try {
    console.log('Step 1: Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/admin/login`, {
      username: 'admin',
      password: 'admin123'
    });

    const token = loginResponse.data.token;
    console.log('✅ Logged in successfully\n');

    const config = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    console.log('Step 2: Checking scheduler status...');
    try {
      const statusResponse = await axios.get(`${BASE_URL}/scheduler/status`, config);
      console.log('📊 Old Scheduler Status:', statusResponse.data);
    } catch (err) {
      console.log('⚠️  Old scheduler status check failed:', err.response?.data?.error?.message || err.message);
    }

    try {
      const dailyStatusResponse = await axios.get(`${BASE_URL}/inventory-scheduler/status`, config);
      console.log('📊 Daily Scheduler Status:', dailyStatusResponse.data);
    } catch (err) {
      console.log('⚠️  Daily scheduler status check failed:', err.response?.data?.error?.message || err.message);
    }
    console.log('');

    console.log('Step 3: Starting schedulers...');
    try {
      await axios.post(`${BASE_URL}/scheduler/start`, {
        intervalMinutes: 30,
        recordsLimit: 50
      }, config);
      console.log('✅ Old scheduler started');
    } catch (err) {
      console.log('⚠️  Old scheduler start failed:', err.response?.data?.error?.message || err.message);
    }

    try {
      await axios.post(`${BASE_URL}/inventory-scheduler/start`, {
        cronExpression: '0 3 * * *'
      }, config);
      console.log('✅ Daily scheduler started');
    } catch (err) {
      console.log('⚠️  Daily scheduler start failed:', err.response?.data?.error?.message || err.message);
    }
    console.log('');

    console.log('Step 4: Triggering CustomerConnect sync...');
    try {
      const ccResponse = await axios.post(`${BASE_URL}/customerconnect/sync/orders`, {
        limit: 50
      }, config);
      console.log('✅ CustomerConnect sync triggered:', ccResponse.data);
    } catch (err) {
      console.log('❌ CustomerConnect sync failed:', err.response?.data?.error?.message || err.message);
      if (err.response?.data?.error?.details) {
        console.log('   Details:', err.response.data.error.details);
      }
    }
    console.log('');

    console.log('Step 5: Waiting 5 seconds for orders to process...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('Step 6: Processing CustomerConnect stock...');
    try {
      const ccStockResponse = await axios.post(`${BASE_URL}/customerconnect/sync/stock`, {}, config);
      console.log('✅ CustomerConnect stock processing triggered:', ccStockResponse.data);
    } catch (err) {
      console.log('❌ CustomerConnect stock processing failed:', err.response?.data?.error?.message || err.message);
    }
    console.log('');

    console.log('Step 7: Triggering RouteStar sync...');
    try {
      const rsPendingResponse = await axios.post(`${BASE_URL}/routestar/sync/pending`, {
        limit: 50
      }, config);
      console.log('✅ RouteStar pending invoices sync triggered:', rsPendingResponse.data);
    } catch (err) {
      console.log('❌ RouteStar pending sync failed:', err.response?.data?.error?.message || err.message);
      if (err.response?.data?.error?.details) {
        console.log('   Details:', err.response.data.error.details);
      }
    }

    try {
      const rsClosedResponse = await axios.post(`${BASE_URL}/routestar/sync/closed`, {
        limit: 50
      }, config);
      console.log('✅ RouteStar closed invoices sync triggered:', rsClosedResponse.data);
    } catch (err) {
      console.log('❌ RouteStar closed sync failed:', err.response?.data?.error?.message || err.message);
    }
    console.log('');

    console.log('Step 8: Waiting 5 seconds for invoices to process...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('Step 9: Processing RouteStar stock...');
    try {
      const rsStockResponse = await axios.post(`${BASE_URL}/routestar/sync/stock`, {}, config);
      console.log('✅ RouteStar stock processing triggered:', rsStockResponse.data);
    } catch (err) {
      console.log('❌ RouteStar stock processing failed:', err.response?.data?.error?.message || err.message);
    }
    console.log('');

    console.log('Step 10: Checking results...');
    try {
      const unprocessedResponse = await axios.get(`${BASE_URL}/warehouse/sync/unprocessed`, config);
      console.log('📊 Unprocessed items:', unprocessedResponse.data);
    } catch (err) {
      console.log('⚠️  Could not check unprocessed items:', err.response?.data?.error?.message || err.message);
    }

    console.log('\n✅ Sync completed! Refresh your inventory page to see the automated data.');
    console.log('💡 The schedulers are now running and will sync automatically every 30 minutes.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

triggerSync();
