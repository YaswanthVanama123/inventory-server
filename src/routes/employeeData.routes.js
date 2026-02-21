const express = require('express');
const router = express.Router();
const employeeDataController = require('../controllers/employeeDataController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Employee routes (for authenticated employees to view their own work)
router.get('/my-work', authenticate, employeeDataController.getMyWorkData);
router.get('/my-statistics', authenticate, employeeDataController.getMyStatistics);
router.get('/my-activity', authenticate, employeeDataController.getMyRecentActivity);
router.get('/my-performance', authenticate, employeeDataController.getMyPerformance);

// Admin routes (for viewing any employee's data by truck number)
router.get('/truck-assignments', authenticate, requireAdmin(), employeeDataController.getAllTruckAssignments);
router.get('/by-truck/:truckNumber', authenticate, requireAdmin(), employeeDataController.getEmployeeDataByTruckNumber);

module.exports = router;
