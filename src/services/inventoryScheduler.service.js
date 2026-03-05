const cron = require('node-cron');
const CustomerConnectSyncService = require('./customerConnectSync.service');
const RouteStarSyncService = require('./routeStarSync.service');
const SyncLog = require('../models/SyncLog');


class InventoryScheduler {
  constructor() {
    this.dailySyncTask = null;
    this.isRunning = false;
    this.lastRun = {
      customerConnect: null,
      routeStar: null,
      combined: null
    };
    this.syncInProgress = false;
  }
  start(options = {}) {
    const {
      cronExpression = '0 3 * * *', 
      ordersLimit = Infinity,
      invoicesLimit = Infinity,
      processStock = true,
      timezone = process.env.TZ || 'America/New_York'
    } = options;
    if (this.isRunning) {
      console.log('Inventory scheduler is already running');
      return;
    }
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
    const fetchAllOrders = ordersLimit === Infinity || ordersLimit === null || ordersLimit === 0;
    const fetchAllInvoices = invoicesLimit === Infinity || invoicesLimit === null || invoicesLimit === 0;
    console.log(`\n🕐 Starting Inventory Sync Scheduler`);
    console.log(`   Schedule: ${cronExpression} (${timezone})`);
    console.log(`   Orders: ${fetchAllOrders ? 'ALL' : ordersLimit}`);
    console.log(`   Invoices: ${fetchAllInvoices ? 'ALL' : invoicesLimit}`);
    console.log(`   Process Stock: ${processStock ? 'Yes' : 'No'}\n`);
    this.dailySyncTask = cron.schedule(
      cronExpression,
      async () => {
        if (this.syncInProgress) {
          console.log('⚠️  Previous sync still in progress, skipping this run');
          return;
        }
        this.syncInProgress = true;
        console.log('\n═══════════════════════════════════════════════════════');
        console.log(`🔄 Starting Scheduled Inventory Sync - ${new Date().toLocaleString()}`);
        console.log('═══════════════════════════════════════════════════════\n');
        try {
          await this.runCompleteSync({ ordersLimit, invoicesLimit, processStock });
          this.lastRun.combined = new Date();
          console.log('\n✅ Scheduled sync completed successfully\n');
        } catch (error) {
          console.error('\n❌ Scheduled sync failed:', error.message);
        } finally {
          this.syncInProgress = false;
        }
      },
      {
        scheduled: true,
        timezone
      }
    );
    this.isRunning = true;
    console.log('✅ Inventory scheduler started successfully');
    console.log(`   Next run: ${this.getNextRunTime(cronExpression, timezone)}\n`);
  }
  async runCompleteSync(options = {}) {
    const {
      ordersLimit = Infinity,
      invoicesLimit = Infinity,
      processStock = true
    } = options;
    const results = {
      customerConnect: null,
      routeStar: null,
      errors: []
    };
    try {
      console.log('\n📦 Step 1: CustomerConnect Orders (Purchases - ADD to Stock)');
      console.log('─────────────────────────────────────────────────────');
      const customerConnectService = new CustomerConnectSyncService();
      await customerConnectService.init();
      results.customerConnect = await customerConnectService.fullSync({
        ordersLimit,
        detailsLimit: ordersLimit, 
        processStock
      });
      await customerConnectService.close();
      this.lastRun.customerConnect = new Date();
      console.log(`✓ Summary: ${results.customerConnect.orders.created + results.customerConnect.orders.updated} orders, ${results.customerConnect.details.synced} details${processStock ? `, ${results.customerConnect.stock.processed} stock processed` : ''}\n`);
    } catch (error) {
      console.error(`✗ Failed: ${error.message}\n`);
      results.errors.push({
        source: 'customerconnect',
        error: error.message,
        timestamp: new Date()
      });
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
      console.log('📦 Step 2: RouteStar Invoices (Sales - SUBTRACT from Stock)');
      console.log('─────────────────────────────────────────────────────');
      const routeStarService = new RouteStarSyncService();
      await routeStarService.init();
      results.routeStar = await routeStarService.fullSync({
        pendingLimit: invoicesLimit,
        closedLimit: invoicesLimit,
        processStock
      });
      await routeStarService.close();
      this.lastRun.routeStar = new Date();
      const totalInvoices = results.routeStar.pending.created + results.routeStar.pending.updated +
                           results.routeStar.closed.created + results.routeStar.closed.updated;
      console.log(`✓ Summary: ${totalInvoices} invoices (${results.routeStar.pending.created + results.routeStar.pending.updated} pending, ${results.routeStar.closed.created + results.routeStar.closed.updated} closed)${processStock ? `, ${results.routeStar.stock.processed} stock processed` : ''}\n`);
    } catch (error) {
      console.error(`✗ Failed: ${error.message}\n`);
      results.errors.push({
        source: 'routestar',
        error: error.message,
        timestamp: new Date()
      });
    }
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 DAILY SYNC SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`CustomerConnect: ${results.customerConnect ? '✓ Success' : '✗ Failed'}`);
    console.log(`RouteStar:       ${results.routeStar ? '✓ Success' : '✗ Failed'}`);
    if (results.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${results.errors.length}`);
      results.errors.forEach(err => {
        console.log(`   - ${err.source}: ${err.error}`);
      });
    }
    console.log('═══════════════════════════════════════════════════════\n');
    return results;
  }
  stop() {
    if (!this.isRunning) {
      console.log('Inventory scheduler is not running');
      return;
    }
    if (this.dailySyncTask) {
      this.dailySyncTask.stop();
      this.dailySyncTask = null;
    }
    this.isRunning = false;
    console.log('✓ Inventory scheduler stopped');
  }
  getStatus() {
    return {
      isRunning: this.isRunning,
      syncInProgress: this.syncInProgress,
      lastRun: this.lastRun,
      nextRun: this.isRunning ? 'Check cron schedule' : 'Not scheduled'
    };
  }
  async runNow(options = {}) {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }
    this.syncInProgress = true;
    console.log('🔄 Running immediate sync...\n');
    try {
      const results = await this.runCompleteSync(options);
      return results;
    } finally {
      this.syncInProgress = false;
    }
  }
  getNextRunTime(cronExpression, timezone) {
    try {
      const schedule = cron.schedule(cronExpression, () => {}, {
        scheduled: false,
        timezone
      });
      return 'Check system logs for exact time';
    } catch (error) {
      return 'Unable to determine';
    }
  }
}
let schedulerInstance = null;
function getInventoryScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new InventoryScheduler();
  }
  return schedulerInstance;
}
module.exports = {
  InventoryScheduler,
  getInventoryScheduler
};
