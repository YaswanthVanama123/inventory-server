const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, vendorController.getAllVendors);

router.get('/active', authenticate, vendorController.getActiveVendors);

router.get('/:id', authenticate, vendorController.getVendorById);

router.post('/', authenticate, vendorController.createVendor);

router.put('/:id', authenticate, requireAdmin(), vendorController.updateVendor);

router.delete('/:id', authenticate, requireAdmin(), vendorController.deleteVendor);

module.exports = router;
