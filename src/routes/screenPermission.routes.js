const express = require('express');
const router = express.Router();
const screenPermissionController = require('../controllers/screenPermission.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Public/User routes
router.get('/my-screens', authenticate, screenPermissionController.getMyScreens);

// Admin routes
router.get('/screens', authenticate, requireAdmin(), screenPermissionController.getAllScreens);
router.get('/screens/default', authenticate, requireAdmin(), screenPermissionController.getDefaultScreens);
router.put('/screens/default', authenticate, requireAdmin(), screenPermissionController.updateDefaultScreens);
router.post('/screens/initialize', authenticate, requireAdmin(), screenPermissionController.initializeScreens);

router.get('/users', authenticate, requireAdmin(), screenPermissionController.getAllUsersWithPermissions);
router.get('/users/:userId/screens', authenticate, requireAdmin(), screenPermissionController.getUserScreens);
router.get('/users/:userId/permissions', authenticate, requireAdmin(), screenPermissionController.getUserSpecificPermissions);
router.put('/users/:userId/permissions', authenticate, requireAdmin(), screenPermissionController.updateUserPermissions);

module.exports = router;
