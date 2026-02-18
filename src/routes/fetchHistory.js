const express = require('express');
const router = express.Router();
const fetchHistoryController = require('../controllers/fetchHistoryController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Get all fetch history
router.get('/', authenticate, requireAdmin(), fetchHistoryController.getFetchHistory);

// Get active/in-progress fetches
router.get('/active', authenticate, requireAdmin(), fetchHistoryController.getActiveFetches);

// Get statistics
router.get('/statistics', authenticate, requireAdmin(), fetchHistoryController.getStatistics);

// Get single fetch details
router.get('/:id', authenticate, requireAdmin(), fetchHistoryController.getFetchDetails);

// Cancel an in-progress fetch
router.post('/:id/cancel', authenticate, requireAdmin(), fetchHistoryController.cancelFetch);

// Cleanup old records
router.delete('/cleanup', authenticate, requireAdmin(), fetchHistoryController.cleanupOldRecords);

module.exports = router;
