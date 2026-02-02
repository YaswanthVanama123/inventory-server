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

// Public routes
// Setup endpoint - create initial admin (one-time use)
router.post('/setup/admin', createInitialAdmin);

// Admin login - separate endpoint
router.post('/admin/login', authValidation.login, validate, adminLogin);

// Employee/User login
router.post('/login', authValidation.login, validate, login);

// Protected routes
router.get('/me', authenticate, getMe);
router.put('/change-password', authenticate, authValidation.changePassword, validate, changePassword);
router.post('/logout', authenticate, logout);

module.exports = router;
