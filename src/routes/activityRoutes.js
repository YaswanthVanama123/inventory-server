const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const activityController = require('../controllers/activityController');

// All activity routes require authentication and admin role
router.use(authenticate);
router.use(requireRole('admin'));

// Get all activities with filtering
router.get('/', activityController.getAllActivities);

// Get activity statistics for dashboard
router.get('/stats', activityController.getActivityStats);

// Get sales activities (invoices created)
router.get('/sales', activityController.getSalesActivities);

// Get stock activities (inventory additions/reductions)
router.get('/stock', activityController.getStockActivities);

// Get delete activities
router.get('/deletions', activityController.getDeleteActivities);

// Get employee activity summary
router.get('/summary/:employeeId', activityController.getEmployeeSummary);

module.exports = router;
