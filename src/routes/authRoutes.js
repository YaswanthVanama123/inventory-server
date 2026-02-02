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



router.post('/setup/admin', createInitialAdmin);


router.post('/admin/login', authValidation.login, validate, adminLogin);


router.post('/login', authValidation.login, validate, login);


router.get('/me', authenticate, getMe);
router.put('/change-password', authenticate, authValidation.changePassword, validate, changePassword);
router.post('/logout', authenticate, logout);

module.exports = router;
