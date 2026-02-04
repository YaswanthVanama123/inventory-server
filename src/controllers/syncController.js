const SyncCustomerConnect = require('../services/sync/syncCustomerConnect');
const SyncRouteStar = require('../services/sync/syncRouteStar');
const SyncLog = require('../models/SyncLog');

/**
 * Trigger CustomerConnect sync
 * @route POST /api/sync/customerconnect
 * @access Admin only
 */
const syncCustomerConnect = async (req, res, next) => {
  try {
    const { limit = 50, processStock = true } = req.body;

    const syncService = new SyncCustomerConnect(req.user.id);
    const result = await syncService.run({ limit, processStock });

    res.status(200).json({
      success: true,
      message: 'CustomerConnect sync completed',
      data: result
    });
  } catch (error) {
    console.error('CustomerConnect sync error:', error);
    next(error);
  }
};

/**
 * Trigger RouteStar sync
 * @route POST /api/sync/routestar
 * @access Admin only
 */
const syncRouteStar = async (req, res, next) => {
  try {
    const { limit = 50, processStock = true } = req.body;

    const syncService = new SyncRouteStar(req.user.id);
    const result = await syncService.run({ limit, processStock });

    res.status(200).json({
      success: true,
      message: 'RouteStar sync completed',
      data: result
    });
  } catch (error) {
    console.error('RouteStar sync error:', error);
    next(error);
  }
};

/**
 * Get sync logs
 * @route GET /api/sync/logs
 * @access Admin only
 */
const getSyncLogs = async (req, res, next) => {
  try {
    const {
      source,
      status,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    if (source) query.source = source;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await SyncLog.countDocuments(query);

    const logs = await SyncLog.find(query)
      .populate('triggeredBy', 'username fullName')
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get sync logs error:', error);
    next(error);
  }
};

/**
 * Get latest sync status for both sources
 * @route GET /api/sync/status
 * @access Admin only
 */
const getSyncStatus = async (req, res, next) => {
  try {
    const customerConnectSync = await SyncLog.getLatestSync('customerconnect');
    const routeStarSync = await SyncLog.getLatestSync('routestar');

    res.status(200).json({
      success: true,
      data: {
        customerconnect: customerConnectSync,
        routestar: routeStarSync
      }
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    next(error);
  }
};

/**
 * Get sync statistics
 * @route GET /api/sync/stats
 * @access Admin only
 */
const getSyncStats = async (req, res, next) => {
  try {
    const { source, days = 30 } = req.query;

    if (!source) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Source parameter is required',
          code: 'SOURCE_REQUIRED'
        }
      });
    }

    const stats = await SyncLog.getSyncStats(source, parseInt(days));

    res.status(200).json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get sync stats error:', error);
    next(error);
  }
};

module.exports = {
  syncCustomerConnect,
  syncRouteStar,
  getSyncLogs,
  getSyncStatus,
  getSyncStats
};
