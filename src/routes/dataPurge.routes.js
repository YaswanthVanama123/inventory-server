const express = require('express');
const router = express.Router();
const dataPurgeController = require('../controllers/dataPurgeController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Permanent, unrecoverable deletes. Admin only, no exceptions.
router.use(authenticate);
router.use(requireAdmin());

router.get('/types', dataPurgeController.getTypes);
router.post('/purge-many', dataPurgeController.purgeManyTypes);
router.post('/:type/purge', dataPurgeController.purgeSelected);
router.post('/:type/purge-all', dataPurgeController.purgeAll);

module.exports = router;
