const cron = require('node-cron');
const SyncCustomerConnect = require('./sync/syncCustomerConnect');
const SyncRouteStar = require('./sync/syncRouteStar');
const RouteStarSyncService = require('./routeStarSync.service');
const routeStarService = require('./routeStar.service');
const customerConnectService = require('./customerConnect.service');

class SyncScheduler {
  constructor() {
    this.customerConnectTask = null;
    this.routeStarTask = null;
    this.routeStarItemsTask = null;
    this.pendingInvoicesTask = null;
    this.ordersTask = null;
    this.closedInvoicesTask = null;
    this.cleanupTask = null;
    this.isRunning = false;
    this.lastRun = {
      customerConnect: null,
      routeStar: null,
      routeStarItems: null,
      pendingInvoices: null,
      orders: null,
      closedInvoices: null
    };
  }

  start(options = {}) {
    const {
      intervalMinutes = parseInt(process.env.SYNC_INTERVAL_MINUTES) || 30,
      limit = 50,
      processStock = true,
      systemUserId = 'system'
    } = options;
    if (this.isRunning) {
      console.log('Scheduler is already running');
      return;
    }
    const cronExpression = `*/${intervalMinutes} * * * *`;
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
    console.log(`Starting sync scheduler with ${intervalMinutes} minute interval`);
    this.customerConnectTask = cron.schedule(
      cronExpression,
      async () => {
        console.log('Running scheduled CustomerConnect sync...');
        try {
          const syncService = new SyncCustomerConnect(systemUserId);
          const result = await syncService.run({ limit, processStock });
          this.lastRun.customerConnect = new Date();
          console.log('CustomerConnect sync completed:', result.summary);
        } catch (error) {
          console.error('Scheduled CustomerConnect sync failed:', error);
        }
      },
      {
        scheduled: true,
        timezone: process.env.TZ || 'America/New_York'
      }
    );
    const offsetMinutes = Math.floor(intervalMinutes / 2);
    const offsetCronExpression = `${offsetMinutes},${offsetMinutes + intervalMinutes} * * * *`;
    this.routeStarTask = cron.schedule(
      offsetCronExpression,
      async () => {
        console.log('Running scheduled RouteStar sync...');
        try {
          const syncService = new SyncRouteStar(systemUserId);
          const result = await syncService.run({ limit, processStock });
          this.lastRun.routeStar = new Date();
          console.log('RouteStar sync completed:', result.summary);
        } catch (error) {
          console.error('Scheduled RouteStar sync failed:', error);
        }
      },
      {
        scheduled: true,
        timezone: process.env.TZ || 'America/New_York'
      }
    );
    this.isRunning = true;
    console.log('Sync scheduler started successfully');
    console.log(`CustomerConnect: Every ${intervalMinutes} minutes`);
    console.log(`RouteStar: Every ${intervalMinutes} minutes (offset by ${offsetMinutes} minutes)`);
    this.startItemsSync();
    this.startDailyAutoFetch();
  }
  startItemsSync() {
    const itemsSyncCron = '0 4 * * *';
    console.log('Setting up RouteStar Items sync schedule (daily at 4:00 AM)');
    this.routeStarItemsTask = cron.schedule(
      itemsSyncCron,
      async () => {
        console.log('\n========================================');
        console.log('Running scheduled RouteStar Items sync (4:00 AM)...');
        console.log('========================================\n');
        let syncService = null;
        try {
          syncService = new RouteStarSyncService();
          await syncService.init();
          const result = await syncService.syncItems(Infinity);
          this.lastRun.routeStarItems = new Date();
          console.log('\n========================================');
          console.log('Scheduled RouteStar Items sync completed successfully');
          console.log(`   - Total: ${result.total}`);
          console.log(`   - Created: ${result.created}`);
          console.log(`   - Updated: ${result.updated}`);
          console.log(`   - Failed: ${result.failed}`);
          console.log('========================================\n');
        } catch (error) {
          console.error('\n========================================');
          console.error('Scheduled RouteStar Items sync failed:');
          console.error('Error:', error.message);
          console.error('========================================\n');
        } finally {
          if (syncService) {
            await syncService.close();
          }
        }
      },
      {
        scheduled: true,
        timezone: process.env.TZ || 'America/New_York'
      }
    );
    console.log('RouteStar Items sync scheduled: Daily at 4:00 AM');
  }
  startDailyAutoFetch() {
    const timezone = process.env.TZ || 'America/New_York';

    // Pending Invoices - Daily at 1:00 AM
    this.pendingInvoicesTask = cron.schedule(
      '0 1 * * *',
      async () => {
        console.log('\n========================================');
        console.log('Running scheduled Pending Invoices fetch (1:00 AM)...');
        console.log('========================================\n');
        try {
          const result = await routeStarService.syncPending(0, 'new', 'scheduled', null);
          this.lastRun.pendingInvoices = new Date();
          console.log('Pending Invoices fetch completed:', result.message);
        } catch (error) {
          console.error('Scheduled Pending Invoices fetch failed:', error.message);
        }
      },
      { scheduled: true, timezone }
    );
    console.log('Pending Invoices auto-fetch scheduled: Daily at 1:00 AM');

    // Orders (CustomerConnect) - Daily at 2:00 AM
    this.ordersTask = cron.schedule(
      '0 2 * * *',
      async () => {
        console.log('\n========================================');
        console.log('Running scheduled Orders fetch (2:00 AM)...');
        console.log('========================================\n');
        try {
          const result = await customerConnectService.syncOrders({
            limit: 0,
            direction: 'new',
            triggeredBy: 'scheduled',
            userId: null
          });
          this.lastRun.orders = new Date();
          console.log('Orders fetch completed:', result.message);
        } catch (error) {
          console.error('Scheduled Orders fetch failed:', error.message);
        }
      },
      { scheduled: true, timezone }
    );
    console.log('Orders auto-fetch scheduled: Daily at 2:00 AM');

    // Closed Invoices - Daily at 3:00 AM
    this.closedInvoicesTask = cron.schedule(
      '0 3 * * *',
      async () => {
        console.log('\n========================================');
        console.log('Running scheduled Closed Invoices fetch (3:00 AM)...');
        console.log('========================================\n');
        try {
          const result = await routeStarService.syncClosed(0, 'new', 'scheduled', null);
          this.lastRun.closedInvoices = new Date();
          console.log('Closed Invoices fetch completed:', result.message);
        } catch (error) {
          console.error('Scheduled Closed Invoices fetch failed:', error.message);
        }
      },
      { scheduled: true, timezone }
    );
    console.log('Closed Invoices auto-fetch scheduled: Daily at 3:00 AM');

    // Cleanup fetch history older than 15 days - Daily at 4:30 AM
    this.cleanupTask = cron.schedule(
      '30 4 * * *',
      async () => {
        try {
          const FetchHistory = require('../models/FetchHistory');
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 15);
          const result = await FetchHistory.deleteMany({
            startedAt: { $lt: cutoff },
            status: { $ne: 'in_progress' }
          });
          console.log(`Fetch history cleanup: deleted ${result.deletedCount} records older than 15 days`);
        } catch (error) {
          console.error('Fetch history cleanup failed:', error.message);
        }
      },
      { scheduled: true, timezone }
    );
    console.log('Fetch history cleanup scheduled: Daily at 4:30 AM (keeps last 15 days)');
  }
  stop() {
    if (!this.isRunning) {
      console.log('Scheduler is not running');
      return;
    }
    if (this.customerConnectTask) {
      this.customerConnectTask.stop();
      this.customerConnectTask = null;
    }
    if (this.routeStarTask) {
      this.routeStarTask.stop();
      this.routeStarTask = null;
    }
    if (this.routeStarItemsTask) {
      this.routeStarItemsTask.stop();
      this.routeStarItemsTask = null;
    }
    if (this.pendingInvoicesTask) {
      this.pendingInvoicesTask.stop();
      this.pendingInvoicesTask = null;
    }
    if (this.ordersTask) {
      this.ordersTask.stop();
      this.ordersTask = null;
    }
    if (this.closedInvoicesTask) {
      this.closedInvoicesTask.stop();
      this.closedInvoicesTask = null;
    }
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
    }
    this.isRunning = false;
    console.log('Sync scheduler stopped');
  }
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      tasks: {
        customerConnect: this.customerConnectTask ? 'scheduled' : 'not scheduled',
        routeStar: this.routeStarTask ? 'scheduled' : 'not scheduled',
        routeStarItems: this.routeStarItemsTask ? 'scheduled (daily 4:00 AM)' : 'not scheduled',
        pendingInvoices: this.pendingInvoicesTask ? 'scheduled (daily 1:00 AM)' : 'not scheduled',
        orders: this.ordersTask ? 'scheduled (daily 2:00 AM)' : 'not scheduled',
        closedInvoices: this.closedInvoicesTask ? 'scheduled (daily 3:00 AM)' : 'not scheduled',
        cleanup: this.cleanupTask ? 'scheduled (daily 4:30 AM, keeps 15 days)' : 'not scheduled'
      }
    };
  }
  async runNow(source = 'both', options = {}) {
    const {
      limit = 50,
      processStock = true,
      userId = 'system'
    } = options;
    const results = {};
    try {
      if (source === 'customerconnect' || source === 'both') {
        console.log('Running immediate CustomerConnect sync...');
        const syncService = new SyncCustomerConnect(userId);
        results.customerConnect = await syncService.run({ limit, processStock });
        this.lastRun.customerConnect = new Date();
      }
      if (source === 'routestar' || source === 'both') {
        console.log('Running immediate RouteStar sync...');
        const syncService = new SyncRouteStar(userId);
        results.routeStar = await syncService.run({ limit, processStock });
        this.lastRun.routeStar = new Date();
      }
      return results;
    } catch (error) {
      console.error('Immediate sync failed:', error);
      throw error;
    }
  }
}
let schedulerInstance = null;
function getScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new SyncScheduler();
  }
  return schedulerInstance;
}
module.exports = {
  SyncScheduler,
  getScheduler
};
