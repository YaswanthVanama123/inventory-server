const express = require('express');
const router = express.Router();
const {
  createInitialAdmin,
  adminLogin,
  login,
  getMe,
  changePassword,
  logout
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authValidation, validate } = require('../middleware/validation');
const { setActivityMeta } = require('../middleware/activityLogger');


// Note: setup/admin, admin/login and login intentionally skip setActivityMeta
// because the controllers already call AuditLog.create with the proper
// performedBy (which the middleware can't supply — it runs before
// authentication, so req.user is undefined).
router.post('/setup/admin', createInitialAdmin);
router.post('/admin/login', authValidation.login, validate, adminLogin);
router.post('/login', authValidation.login, validate, login);
router.get('/me', authenticate, setActivityMeta('VIEW', 'USER'), getMe);
router.put('/change-password', authenticate, authValidation.changePassword, validate, setActivityMeta('PASSWORD_CHANGE', 'USER'), changePassword);
router.post('/logout', authenticate, setActivityMeta('LOGOUT', 'USER'), logout);
module.exports = router;
