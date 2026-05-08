const express = require('express');
const router = express.Router();
const screenPermissionController = require('../controllers/screenPermission.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { setActivityMeta } = require('../middleware/activityLogger');

// Public/User routes
router.get('/my-screens', authenticate, setActivityMeta('VIEW', 'USER'), screenPermissionController.getMyScreens);

// Admin routes - Screen Management
router.get('/screens', authenticate, requireAdmin(), setActivityMeta('VIEW', 'USER'), screenPermissionController.getAllScreens);
router.get('/screens/:screenId', authenticate, requireAdmin(), setActivityMeta('VIEW', 'USER'), screenPermissionController.getScreenById);
router.post('/screens', authenticate, requireAdmin(), setActivityMeta('CREATE', 'USER'), screenPermissionController.createScreen);
router.put('/screens/:screenId', authenticate, requireAdmin(), setActivityMeta('UPDATE', 'USER'), screenPermissionController.updateScreen);
router.delete('/screens/:screenId', authenticate, requireAdmin(), setActivityMeta('DELETE', 'USER'), screenPermissionController.deleteScreen);
router.get('/screens/default', authenticate, requireAdmin(), setActivityMeta('VIEW', 'USER'), screenPermissionController.getDefaultScreens);
router.put('/screens/default', authenticate, requireAdmin(), setActivityMeta('UPDATE', 'USER'), screenPermissionController.updateDefaultScreens);
router.post('/screens/initialize', authenticate, requireAdmin(), setActivityMeta('CREATE', 'USER'), screenPermissionController.initializeScreens);

// Admin routes - User Permissions
router.get('/users', authenticate, requireAdmin(), setActivityMeta('VIEW', 'USER'), screenPermissionController.getAllUsersWithPermissions);
router.get('/users/:userId/screens', authenticate, requireAdmin(), setActivityMeta('VIEW', 'USER'), screenPermissionController.getUserScreens);
router.get('/users/:userId/permissions', authenticate, requireAdmin(), setActivityMeta('VIEW', 'USER'), screenPermissionController.getUserSpecificPermissions);
router.put('/users/:userId/permissions', authenticate, requireAdmin(), setActivityMeta('UPDATE', 'USER'), screenPermissionController.updateUserPermissions);

module.exports = router;
