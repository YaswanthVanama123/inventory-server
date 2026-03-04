const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const activityController = require('../controllers/activityController');


router.use(authenticate);
router.use(requireRole('admin'));

// OPTIMIZED: Combined endpoint for activities page (activities + stats + users)
router.get('/page-data', activityController.getPageData);

// Get all activities with filters
router.get('/', activityController.getAllActivities);

// Get activity statistics
router.get('/stats', activityController.getActivityStats);

// Get sales activities
router.get('/sales', activityController.getSalesActivities);

// Get stock change activities
router.get('/stock', activityController.getStockActivities);

// Get deletion activities
router.get('/deletions', activityController.getDeleteActivities);

// Get employee summary
router.get('/summary/:employeeId', activityController.getEmployeeSummary);

module.exports = router;
