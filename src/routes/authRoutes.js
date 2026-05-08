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


router.post('/setup/admin', setActivityMeta('SETUP', 'INITIAL_ADMIN'), createInitialAdmin);
router.post('/admin/login', authValidation.login, validate, setActivityMeta('LOGIN', 'ADMIN'), adminLogin);
router.post('/login', authValidation.login, validate, setActivityMeta('LOGIN', 'USER'), login);
router.get('/me', authenticate, setActivityMeta('VIEW', 'PROFILE'), getMe);
router.put('/change-password', authenticate, authValidation.changePassword, validate, setActivityMeta('CHANGE', 'PASSWORD'), changePassword);
router.post('/logout', authenticate, setActivityMeta('LOGOUT', 'USER'), logout);
module.exports = router;
