const inventorySchedulerService = require('../services/inventoryScheduler.service');


class InventorySchedulerController {
  
  async getStatus(req, res, next) {
    try {
      const status = inventorySchedulerService.getStatus();

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Get scheduler status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get scheduler status',
        error: error.message
      });
    }
  }

  
  async startScheduler(req, res, next) {
    try {
      const status = inventorySchedulerService.startScheduler(req.body);

      res.json({
        success: true,
        message: 'Scheduler started successfully',
        data: status
      });
    } catch (error) {
      console.error('Start scheduler error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start scheduler',
        error: error.message
      });
    }
  }

  
  async stopScheduler(req, res, next) {
    try {
      const status = inventorySchedulerService.stopScheduler();

      res.json({
        success: true,
        message: 'Scheduler stopped successfully',
        data: status
      });
    } catch (error) {
      console.error('Stop scheduler error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop scheduler',
        error: error.message
      });
    }
  }

  
  async runNow(req, res, next) {
    try {
      const result = inventorySchedulerService.runNow(req.body);

      res.json({
        success: true,
        message: result.message,
        note: result.note
      });
    } catch (error) {
      console.error('Run now error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start immediate sync',
        error: error.message
      });
    }
  }
}

module.exports = new InventorySchedulerController();
