const activityLogService = require('../services/activityLogService');
const { logActivity } = require('../middleware/activityLogger');

/**
 * Activity Log Controller
 * Handles HTTP requests for activity logs
 */

/**
 * Get activity logs with filtering
 * GET /api/activity-logs
 */
const getActivityLogs = async (req, res, next) => {
  try {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      resource,
      action,
      performedBy,
      startDate,
      endDate,
      success,
      device,
      search
    } = req.query;

    const filters = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      sortBy: sortBy || 'timestamp',
      sortOrder: sortOrder || 'desc',
      resource,
      action,
      performedBy,
      startDate,
      endDate,
      success: success !== undefined ? success === 'true' : undefined,
      device,
      search
    };

    const result = await activityLogService.getActivityLogs(filters);

    // Log this view action
    await logActivity(
      {
        action: 'VIEW',
        resource: 'ACTIVITY_LOG',
        details: { filters },
        success: true
      },
      req.user,
      req
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    next(error);
  }
};

/**
 * Get activity statistics
 * GET /api/activity-logs/stats
 */
const getActivityStats = async (req, res, next) => {
  try {
    const { startDate, endDate, performedBy } = req.query;

    const filters = {
      startDate,
      endDate,
      performedBy
    };

    const stats = await activityLogService.getActivityStats(filters);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get activity stats error:', error);
    next(error);
  }
};

/**
 * Get current user's activity logs
 * GET /api/activity-logs/my-activities
 */
const getMyActivities = async (req, res, next) => {
  try {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      resource,
      action,
      startDate,
      endDate
    } = req.query;

    const filters = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      sortBy: sortBy || 'timestamp',
      sortOrder: sortOrder || 'desc',
      resource,
      action,
      startDate,
      endDate
    };

    const result = await activityLogService.getUserActivityLogs(req.user._id, filters);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get my activities error:', error);
    next(error);
  }
};

/**
 * Get recent activities
 * GET /api/activity-logs/recent
 */
const getRecentActivities = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const logs = await activityLogService.getRecentActivities(parseInt(limit) || 20);

    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Get recent activities error:', error);
    next(error);
  }
};

/**
 * Get resource timeline
 * GET /api/activity-logs/resource/:resource/:resourceId
 */
const getResourceTimeline = async (req, res, next) => {
  try {
    const { resource, resourceId } = req.params;
    const logs = await activityLogService.getResourceTimeline(resource, resourceId);

    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Get resource timeline error:', error);
    next(error);
  }
};

/**
 * Get activity breakdown
 * GET /api/activity-logs/breakdown
 */
const getActivityBreakdown = async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy } = req.query;

    const filters = {
      startDate,
      endDate,
      groupBy: groupBy || 'day'
    };

    const breakdown = await activityLogService.getActivityBreakdown(filters);

    res.status(200).json({
      success: true,
      data: breakdown
    });
  } catch (error) {
    console.error('Get activity breakdown error:', error);
    next(error);
  }
};

/**
 * Get top active users
 * GET /api/activity-logs/top-users
 */
const getTopActiveUsers = async (req, res, next) => {
  try {
    const { limit, startDate, endDate } = req.query;

    const filters = {
      startDate,
      endDate
    };

    const topUsers = await activityLogService.getTopActiveUsers(
      parseInt(limit) || 10,
      filters
    );

    res.status(200).json({
      success: true,
      data: topUsers
    });
  } catch (error) {
    console.error('Get top active users error:', error);
    next(error);
  }
};

/**
 * Get failed activities
 * GET /api/activity-logs/failed
 */
const getFailedActivities = async (req, res, next) => {
  try {
    const { page, limit, startDate, endDate } = req.query;

    const filters = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      startDate,
      endDate
    };

    const result = await activityLogService.getFailedActivities(filters);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get failed activities error:', error);
    next(error);
  }
};

/**
 * Export activity logs
 * GET /api/activity-logs/export
 */
const exportActivityLogs = async (req, res, next) => {
  try {
    const {
      format,
      resource,
      action,
      performedBy,
      startDate,
      endDate,
      success,
      device
    } = req.query;

    const filters = {
      resource,
      action,
      performedBy,
      startDate,
      endDate,
      success: success !== undefined ? success === 'true' : undefined,
      device
    };

    const exportFormat = format || 'json';
    const data = await activityLogService.exportActivityLogs(filters, exportFormat);

    // Log export action
    await logActivity(
      {
        action: 'EXPORT',
        resource: 'ACTIVITY_LOG',
        details: { filters, format: exportFormat },
        success: true
      },
      req.user,
      req
    );

    if (exportFormat === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=activity-logs.csv');
      res.status(200).send(data);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=activity-logs.json');
      res.status(200).json({
        success: true,
        data
      });
    }
  } catch (error) {
    console.error('Export activity logs error:', error);
    next(error);
  }
};

/**
 * Delete old logs (admin only)
 * DELETE /api/activity-logs/cleanup
 */
const deleteOldLogs = async (req, res, next) => {
  try {
    const { daysToKeep } = req.body;

    const result = await activityLogService.deleteOldLogs(parseInt(daysToKeep) || 90);

    // Log cleanup action
    await logActivity(
      {
        action: 'DELETE',
        resource: 'ACTIVITY_LOG',
        details: { daysToKeep, deletedCount: result.deletedCount },
        success: true
      },
      req.user,
      req
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Delete old logs error:', error);
    next(error);
  }
};

module.exports = {
  getActivityLogs,
  getActivityStats,
  getMyActivities,
  getRecentActivities,
  getResourceTimeline,
  getActivityBreakdown,
  getTopActiveUsers,
  getFailedActivities,
  exportActivityLogs,
  deleteOldLogs
};
