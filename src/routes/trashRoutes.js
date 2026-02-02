const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const trashController = require('../controllers/trashController');


router.use(authenticate);
router.use(requireRole('admin'));


router.get('/', trashController.getAllDeletedItems);


router.post('/:type/:id/restore', trashController.restoreItem);


router.delete('/:type/:id', trashController.permanentlyDeleteItem);


router.delete('/empty', trashController.emptyTrash);

module.exports = router;
