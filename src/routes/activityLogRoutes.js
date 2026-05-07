const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLogController');
const { authenticate, requireRole } = require('../middleware/auth');

/**
 * Activity Log Routes
 * Base path: /api/activity-logs
 */

// Protect all routes - authentication required
router.use(authenticate);

/**
 * @route   GET /api/activity-logs
 * @desc    Get activity logs with filtering (admin only)
 * @access  Private/Admin
 */
router.get(
  '/',
  requireRole('admin'),
  activityLogController.getActivityLogs
);

/**
 * @route   GET /api/activity-logs/stats
 * @desc    Get activity statistics (admin only)
 * @access  Private/Admin
 */
router.get(
  '/stats',
  requireRole('admin'),
  activityLogController.getActivityStats
);

/**
 * @route   GET /api/activity-logs/my-activities
 * @desc    Get current user's own activity logs
 * @access  Private
 */
router.get(
  '/my-activities',
  activityLogController.getMyActivities
);

/**
 * @route   GET /api/activity-logs/recent
 * @desc    Get recent activities (admin only)
 * @access  Private/Admin
 */
router.get(
  '/recent',
  requireRole('admin'),
  activityLogController.getRecentActivities
);

/**
 * @route   GET /api/activity-logs/breakdown
 * @desc    Get activity breakdown by time period (admin only)
 * @access  Private/Admin
 */
router.get(
  '/breakdown',
  requireRole('admin'),
  activityLogController.getActivityBreakdown
);

/**
 * @route   GET /api/activity-logs/top-users
 * @desc    Get top active users (admin only)
 * @access  Private/Admin
 */
router.get(
  '/top-users',
  requireRole('admin'),
  activityLogController.getTopActiveUsers
);

/**
 * @route   GET /api/activity-logs/failed
 * @desc    Get failed activities (admin only)
 * @access  Private/Admin
 */
router.get(
  '/failed',
  requireRole('admin'),
  activityLogController.getFailedActivities
);

/**
 * @route   GET /api/activity-logs/export
 * @desc    Export activity logs (admin only)
 * @access  Private/Admin
 */
router.get(
  '/export',
  requireRole('admin'),
  activityLogController.exportActivityLogs
);

/**
 * @route   GET /api/activity-logs/resource/:resource/:resourceId
 * @desc    Get resource timeline (admin only)
 * @access  Private/Admin
 */
router.get(
  '/resource/:resource/:resourceId',
  requireRole('admin'),
  activityLogController.getResourceTimeline
);

/**
 * @route   DELETE /api/activity-logs/cleanup
 * @desc    Delete old logs (admin only)
 * @access  Private/Admin
 */
router.delete(
  '/cleanup',
  requireRole('admin'),
  activityLogController.deleteOldLogs
);

module.exports = router;
