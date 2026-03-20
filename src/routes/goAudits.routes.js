const express = require('express');
const router = express.Router();
const goAuditsController = require('../controllers/goAuditsController');
const { authenticate } = require('../middleware/auth');

// Test authentication
router.get('/test-auth', authenticate, goAuditsController.testAuthentication);

// Get all locations from GoAudits
router.get('/locations', authenticate, goAuditsController.getLocations);

// Get sync status
router.get('/sync-status', authenticate, goAuditsController.getSyncStatus);

// Sync customers from closed invoices
router.post('/sync-closed-invoice-customers', authenticate, goAuditsController.syncClosedInvoiceCustomers);

// Sync single customer
router.post('/sync-customer/:customerId', authenticate, goAuditsController.syncSingleCustomer);

// Remove sync mapping
router.delete('/sync-mapping/:customerId', authenticate, goAuditsController.removeSyncMapping);

module.exports = router;
