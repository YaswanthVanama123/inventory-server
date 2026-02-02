const express = require('express');
const router = express.Router();
const {
  getAllInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  generateInvoicePDF,
  getInvoiceStats,
  sendInvoiceEmail
} = require('../controllers/invoiceController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { invoiceValidation, validate } = require('../middleware/validation');
const { param } = require('express-validator');

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin());

// GET /api/invoices/stats - Get invoice statistics (must be before /:id route)
router.get('/stats', getInvoiceStats);

// GET /api/invoices - List all invoices with pagination, filtering, and search
router.get('/', getAllInvoices);

// GET /api/invoices/:id - Get single invoice by ID
router.get(
  '/:id',
  param('id').isMongoId().withMessage('Invalid invoice ID'),
  validate,
  getInvoice
);

// POST /api/invoices - Create new invoice
router.post(
  '/',
  invoiceValidation.create,
  validate,
  createInvoice
);

// PUT /api/invoices/:id - Update existing invoice
router.put(
  '/:id',
  invoiceValidation.update,
  validate,
  updateInvoice
);

// DELETE /api/invoices/:id - Delete invoice
router.delete(
  '/:id',
  param('id').isMongoId().withMessage('Invalid invoice ID'),
  validate,
  deleteInvoice
);

// GET /api/invoices/:id/pdf - Download invoice as PDF
router.get(
  '/:id/pdf',
  param('id').isMongoId().withMessage('Invalid invoice ID'),
  validate,
  generateInvoicePDF
);

// POST /api/invoices/:id/send-email - Send invoice via email
router.post(
  '/:id/send-email',
  invoiceValidation.sendEmail,
  validate,
  sendInvoiceEmail
);

module.exports = router;
