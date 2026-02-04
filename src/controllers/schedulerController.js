const { getScheduler } = require('../services/scheduler');

/**
 * Get scheduler status
 * @route GET /api/scheduler/status
 * @access Admin only
 */
const getSchedulerStatus = async (req, res, next) => {
  try {
    const scheduler = getScheduler();
    const status = scheduler.getStatus();

    res.status(200).json({
      success: true,
      data: { status }
    });
  } catch (error) {
    console.error('Get scheduler status error:', error);
    next(error);
  }
};

/**
 * Start the scheduler
 * @route POST /api/scheduler/start
 * @access Admin only
 */
const startScheduler = async (req, res, next) => {
  try {
    const {
      intervalMinutes,
      limit,
      processStock
    } = req.body;

    const scheduler = getScheduler();
    scheduler.start({
      intervalMinutes,
      limit,
      processStock,
      systemUserId: req.user.id
    });

    const status = scheduler.getStatus();

    res.status(200).json({
      success: true,
      message: 'Scheduler started successfully',
      data: { status }
    });
  } catch (error) {
    console.error('Start scheduler error:', error);
    next(error);
  }
};

/**
 * Stop the scheduler
 * @route POST /api/scheduler/stop
 * @access Admin only
 */
const stopScheduler = async (req, res, next) => {
  try {
    const scheduler = getScheduler();
    scheduler.stop();

    const status = scheduler.getStatus();

    res.status(200).json({
      success: true,
      message: 'Scheduler stopped successfully',
      data: { status }
    });
  } catch (error) {
    console.error('Stop scheduler error:', error);
    next(error);
  }
};

/**
 * Run sync immediately
 * @route POST /api/scheduler/run-now
 * @access Admin only
 */
const runNow = async (req, res, next) => {
  try {
    const {
      source = 'both',
      limit,
      processStock
    } = req.body;

    const scheduler = getScheduler();
    const results = await scheduler.runNow(source, {
      limit,
      processStock,
      userId: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'Immediate sync completed',
      data: { results }
    });
  } catch (error) {
    console.error('Run now error:', error);
    next(error);
  }
};

module.exports = {
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  runNow
};
