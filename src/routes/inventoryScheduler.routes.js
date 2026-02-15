const express = require('express');
const router = express.Router();
const { getInventoryScheduler } = require('../services/inventoryScheduler.service');
const { authenticate, requireAdmin } = require('../middleware/auth');






router.get('/status', authenticate, requireAdmin(), async (req, res) => {
  try {
    const scheduler = getInventoryScheduler();
    const status = scheduler.getStatus();

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
});






router.post('/start', authenticate, requireAdmin(), async (req, res) => {
  try {
    const {
      cronExpression = '0 3 * * *', 
      ordersLimit = 100,
      invoicesLimit = 100,
      processStock = true,
      timezone = 'America/New_York'
    } = req.body;

    const scheduler = getInventoryScheduler();
    scheduler.start({
      cronExpression,
      ordersLimit,
      invoicesLimit,
      processStock,
      timezone
    });

    res.json({
      success: true,
      message: 'Scheduler started successfully',
      data: scheduler.getStatus()
    });
  } catch (error) {
    console.error('Start scheduler error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start scheduler',
      error: error.message
    });
  }
});






router.post('/stop', authenticate, requireAdmin(), async (req, res) => {
  try {
    const scheduler = getInventoryScheduler();
    scheduler.stop();

    res.json({
      success: true,
      message: 'Scheduler stopped successfully',
      data: scheduler.getStatus()
    });
  } catch (error) {
    console.error('Stop scheduler error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop scheduler',
      error: error.message
    });
  }
});






router.post('/run-now', authenticate, requireAdmin(), async (req, res) => {
  try {
    const {
      ordersLimit = 100,
      invoicesLimit = 100,
      processStock = true
    } = req.body;

    const scheduler = getInventoryScheduler();

    
    scheduler.runNow({
      ordersLimit,
      invoicesLimit,
      processStock
    }).then(results => {
      console.log('Manual sync completed:', results);
    }).catch(error => {
      console.error('Manual sync failed:', error);
    });

    res.json({
      success: true,
      message: 'Sync started. Check logs for progress.',
      note: 'This sync runs in the background. Use GET /status to check completion.'
    });
  } catch (error) {
    console.error('Run now error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start immediate sync',
      error: error.message
    });
  }
});

module.exports = router;
