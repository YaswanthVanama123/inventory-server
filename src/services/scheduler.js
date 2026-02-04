const cron = require('node-cron');
const SyncCustomerConnect = require('./sync/syncCustomerConnect');
const SyncRouteStar = require('./sync/syncRouteStar');

class SyncScheduler {
  constructor() {
    this.customerConnectTask = null;
    this.routeStarTask = null;
    this.isRunning = false;
    this.lastRun = {
      customerConnect: null,
      routeStar: null
    };
  }

  /**
   * Start the scheduler
   * @param {Object} options - Configuration options
   * @param {number} options.intervalMinutes - Sync interval in minutes
   * @param {number} options.limit - Number of records to fetch per sync
   * @param {boolean} options.processStock - Whether to process stock movements
   * @param {string} options.systemUserId - User ID for system-triggered syncs
   */
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

    // Validate cron expression
    const cronExpression = `*/${intervalMinutes} * * * *`;
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    console.log(`Starting sync scheduler with ${intervalMinutes} minute interval`);

    // Schedule CustomerConnect sync
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

    // Schedule RouteStar sync with offset to avoid overlap
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
  }

  /**
   * Stop the scheduler
   */
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

    this.isRunning = false;
    console.log('Sync scheduler stopped');
  }

  /**
   * Get scheduler status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      tasks: {
        customerConnect: this.customerConnectTask ? 'scheduled' : 'not scheduled',
        routeStar: this.routeStarTask ? 'scheduled' : 'not scheduled'
      }
    };
  }

  /**
   * Run sync immediately (outside of schedule)
   * @param {string} source - 'customerconnect' or 'routestar' or 'both'
   * @param {Object} options - Sync options
   */
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

// Singleton instance
let schedulerInstance = null;

/**
 * Get scheduler instance
 * @returns {SyncScheduler}
 */
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
