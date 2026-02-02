const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const activityController = require('../controllers/activityController');


router.use(authenticate);
router.use(requireRole('admin'));


router.get('/', activityController.getAllActivities);


router.get('/stats', activityController.getActivityStats);


router.get('/sales', activityController.getSalesActivities);


router.get('/stock', activityController.getStockActivities);


router.get('/deletions', activityController.getDeleteActivities);


router.get('/summary/:employeeId', activityController.getEmployeeSummary);

module.exports = router;
