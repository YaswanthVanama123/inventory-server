const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  resetPassword
} = require('../controllers/userController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { userValidation, validate } = require('../middleware/validation');


router.use(authenticate);
router.use(requireAdmin());

router.route('/')
  .get(getUsers)
  .post(userValidation.create, validate, createUser);

router.route('/:id')
  .get(getUser)
  .put(userValidation.update, validate, updateUser)
  .delete(deleteUser);

router.post('/:id/reset-password', userValidation.resetPassword, validate, resetPassword);

module.exports = router;
