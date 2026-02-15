const cron = require('node-cron');
const SyncCustomerConnect = require('./sync/syncCustomerConnect');
const SyncRouteStar = require('./sync/syncRouteStar');
const RouteStarSyncService = require('./routeStarSync.service');

class SyncScheduler {
  constructor() {
    this.customerConnectTask = null;
    this.routeStarTask = null;
    this.routeStarItemsTask = null;
    this.isRunning = false;
    this.lastRun = {
      customerConnect: null,
      routeStar: null,
      routeStarItems: null
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
  }

  


  startItemsSync() {
    
    
    const itemsSyncCron = '0 3 * * *';

    console.log('Setting up RouteStar Items sync schedule (daily at 3:00 AM)');

    this.routeStarItemsTask = cron.schedule(
      itemsSyncCron,
      async () => {
        console.log('\n========================================');
        console.log('Running scheduled RouteStar Items sync (3:00 AM)...');
        console.log('========================================\n');

        let syncService = null;

        try {
          syncService = new RouteStarSyncService();
          await syncService.init();

          const result = await syncService.syncItems(Infinity); 

          this.lastRun.routeStarItems = new Date();

          console.log('\n========================================');
          console.log('✅ Scheduled RouteStar Items sync completed successfully');
          console.log(`   - Total: ${result.total}`);
          console.log(`   - Created: ${result.created}`);
          console.log(`   - Updated: ${result.updated}`);
          console.log(`   - Failed: ${result.failed}`);
          console.log('========================================\n');
        } catch (error) {
          console.error('\n========================================');
          console.error('❌ Scheduled RouteStar Items sync failed:');
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

    console.log('RouteStar Items sync scheduled: Daily at 3:00 AM');
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
        routeStarItems: this.routeStarItemsTask ? 'scheduled (daily 3:00 AM)' : 'not scheduled'
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
