const express = require('express');
const router = express.Router();
const discrepancyController = require('../controllers/discrepancyController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get all discrepancies
router.get('/', discrepancyController.getDiscrepancies);

// Get discrepancy summary
router.get('/summary', discrepancyController.getDiscrepancySummary);

// Create new discrepancy
router.post('/', discrepancyController.createDiscrepancy);

// Update discrepancy
router.put('/:id', discrepancyController.updateDiscrepancy);

// Approve discrepancy
router.post('/:id/approve', requireRole('admin', 'manager'), discrepancyController.approveDiscrepancy);

// Reject discrepancy
router.post('/:id/reject', requireRole('admin', 'manager'), discrepancyController.rejectDiscrepancy);

// Bulk approve
router.post('/bulk-approve', requireRole('admin', 'manager'), discrepancyController.bulkApproveDiscrepancies);

// Delete discrepancy
router.delete('/:id', requireRole('admin'), discrepancyController.deleteDiscrepancy);

module.exports = router;
