const express = require('express');
const router = express.Router();
const fetchHistoryController = require('../controllers/fetchHistoryController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.get('/page-data', authenticate, fetchHistoryController.getPageData);
router.get('/', authenticate, fetchHistoryController.getFetchHistory);
router.get('/active', authenticate, fetchHistoryController.getActiveFetches);
router.get('/statistics', authenticate, fetchHistoryController.getStatistics);
router.get('/:id', authenticate, fetchHistoryController.getFetchDetails);
router.post('/:id/cancel', authenticate, requireAdmin(), fetchHistoryController.cancelFetch);
router.delete('/cleanup', authenticate, requireAdmin(), fetchHistoryController.cleanupOldRecords);
module.exports = router;
