const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Get all vendors
router.get('/', authenticate, vendorController.getAllVendors);

// Get active vendors (for dropdown)
router.get('/active', authenticate, vendorController.getActiveVendors);

// Get single vendor by ID
router.get('/:id', authenticate, vendorController.getVendorById);

// Create new vendor
router.post('/', authenticate, vendorController.createVendor);

// Update vendor (admin only)
router.put('/:id', authenticate, requireAdmin(), vendorController.updateVendor);

// Delete vendor (admin only)
router.delete('/:id', authenticate, requireAdmin(), vendorController.deleteVendor);

module.exports = router;
