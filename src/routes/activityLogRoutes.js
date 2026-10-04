const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLogController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get(
  '/',
  requireRole('admin'),
  activityLogController.getActivityLogs
);

router.get(
  '/stats',
  requireRole('admin'),
  activityLogController.getActivityStats
);

router.get(
  '/my-activities',
  activityLogController.getMyActivities
);

router.get(
  '/recent',
  requireRole('admin'),
  activityLogController.getRecentActivities
);

router.get(
  '/breakdown',
  requireRole('admin'),
  activityLogController.getActivityBreakdown
);

router.get(
  '/top-users',
  requireRole('admin'),
  activityLogController.getTopActiveUsers
);

router.get(
  '/failed',
  requireRole('admin'),
  activityLogController.getFailedActivities
);

router.get(
  '/export',
  requireRole('admin'),
  activityLogController.exportActivityLogs
);

router.get(
  '/resource/:resource/:resourceId',
  requireRole('admin'),
  activityLogController.getResourceTimeline
);

router.delete(
  '/cleanup',
  requireRole('admin'),
  activityLogController.deleteOldLogs
);

module.exports = router;
