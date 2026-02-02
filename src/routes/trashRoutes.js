const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const trashController = require('../controllers/trashController');

// All trash routes require authentication and admin role
router.use(authenticate);
router.use(requireRole('admin'));

// Get all deleted items
router.get('/', trashController.getAllDeletedItems);

// Restore a deleted item
router.post('/:type/:id/restore', trashController.restoreItem);

// Permanently delete an item
router.delete('/:type/:id', trashController.permanentlyDeleteItem);

// Empty trash (permanently delete all deleted items)
router.delete('/empty', trashController.emptyTrash);

module.exports = router;
