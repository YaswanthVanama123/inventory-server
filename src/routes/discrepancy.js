const express = require('express');
const router = express.Router();
const discrepancyController = require('../controllers/discrepancyController');
const { authenticate, requireRole } = require('../middleware/auth');


router.use(authenticate);


router.get('/', discrepancyController.getDiscrepancies);


router.get('/summary', discrepancyController.getDiscrepancySummary);


router.get('/:id', discrepancyController.getDiscrepancyById);


router.post('/', discrepancyController.createDiscrepancy);


router.put('/:id', discrepancyController.updateDiscrepancy);


router.post('/:id/approve', requireRole('admin', 'manager'), discrepancyController.approveDiscrepancy);


router.post('/:id/reject', requireRole('admin', 'manager'), discrepancyController.rejectDiscrepancy);


router.post('/bulk-approve', requireRole('admin', 'manager'), discrepancyController.bulkApproveDiscrepancies);


router.delete('/:id', requireRole('admin'), discrepancyController.deleteDiscrepancy);

module.exports = router;
