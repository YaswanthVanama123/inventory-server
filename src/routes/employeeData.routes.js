const express = require('express');
const router = express.Router();
const employeeDataController = require('../controllers/employeeDataController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Combined dashboard endpoint (all employee data in one call)
router.get('/my-dashboard', authenticate, employeeDataController.getMyCombinedDashboard);

// Individual employee data endpoints
router.get('/my-work', authenticate, employeeDataController.getMyWorkData);
router.get('/my-statistics', authenticate, employeeDataController.getMyStatistics);
router.get('/my-activity', authenticate, employeeDataController.getMyRecentActivity);
router.get('/my-performance', authenticate, employeeDataController.getMyPerformance);


router.get('/truck-assignments', authenticate, requireAdmin(), employeeDataController.getAllTruckAssignments);
router.get('/by-truck/:truckNumber', authenticate, requireAdmin(), employeeDataController.getEmployeeDataByTruckNumber);

module.exports = router;
