

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth'); 
const {
  downloadInvoicePDF,
  previewInvoicePDF,
  emailInvoicePDF,
  saveInvoicePDF,
  bulkDownloadInvoices
} = require('../controllers/invoiceController'); 


router.use(protect);






router.get('/:id/pdf', downloadInvoicePDF);




router.get('/:id/preview', previewInvoicePDF);




router.post('/:id/email', emailInvoicePDF);




router.post('/:id/save-pdf', authorize('admin', 'manager'), saveInvoicePDF);




router.post('/bulk-download', authorize('admin', 'manager'), bulkDownloadInvoices);

module.exports = router;


