/**
 * Invoice Routes Integration Example
 * Add these routes to your Express application
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth'); // Adjust path as needed
const {
  downloadInvoicePDF,
  previewInvoicePDF,
  emailInvoicePDF,
  saveInvoicePDF,
  bulkDownloadInvoices
} = require('../controllers/invoiceController'); // Adjust path as needed

// All routes require authentication
router.use(protect);

/**
 * PDF Generation Routes
 */

// @route   GET /api/invoices/:id/pdf
// @desc    Download invoice as PDF
// @access  Private
router.get('/:id/pdf', downloadInvoicePDF);

// @route   GET /api/invoices/:id/preview
// @desc    Preview invoice PDF in browser
// @access  Private
router.get('/:id/preview', previewInvoicePDF);

// @route   POST /api/invoices/:id/email
// @desc    Email invoice PDF to customer
// @access  Private
router.post('/:id/email', emailInvoicePDF);

// @route   POST /api/invoices/:id/save-pdf
// @desc    Save invoice PDF to server/cloud
// @access  Private (Admin only)
router.post('/:id/save-pdf', authorize('admin', 'manager'), saveInvoicePDF);

// @route   POST /api/invoices/bulk-download
// @desc    Download multiple invoices as ZIP
// @access  Private (Admin only)
router.post('/bulk-download', authorize('admin', 'manager'), bulkDownloadInvoices);

module.exports = router;

/**
 * Usage in main server.js or app.js:
 *
 * const invoiceRoutes = require('./routes/invoiceRoutes');
 * app.use('/api/invoices', invoiceRoutes);
 */
