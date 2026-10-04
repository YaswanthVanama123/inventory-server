const express = require('express');
const router = express.Router();
const goAuditsController = require('../controllers/goAuditsController');
const { authenticate } = require('../middleware/auth');

router.get('/test-auth', authenticate, goAuditsController.testAuthentication);

router.get('/locations', authenticate, goAuditsController.getLocations);

router.get('/sync-status', authenticate, goAuditsController.getSyncStatus);

router.post('/sync-closed-invoice-customers', authenticate, goAuditsController.syncClosedInvoiceCustomers);

router.post('/sync-customer/:customerId', authenticate, goAuditsController.syncSingleCustomer);

router.delete('/sync-mapping/:customerId', authenticate, goAuditsController.removeSyncMapping);

module.exports = router;
