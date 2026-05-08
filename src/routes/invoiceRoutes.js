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
  sendInvoiceEmail,
  getGroupedInvoiceItems
} = require('../controllers/invoiceController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { invoiceValidation, validate } = require('../middleware/validation');
const { param } = require('express-validator');
const { setActivityMeta } = require('../middleware/activityLogger');


router.use(authenticate);
router.use(requireAdmin());
router.get('/items/grouped', setActivityMeta('VIEW', 'INVOICE_ITEMS_GROUPED'), getGroupedInvoiceItems);
router.get('/stats', setActivityMeta('VIEW', 'INVOICE_STATS'), getInvoiceStats);
router.get('/', setActivityMeta('VIEW', 'INVOICE'), getAllInvoices);
router.get(
  '/:id',
  param('id').isMongoId().withMessage('Invalid invoice ID'),
  validate,
  setActivityMeta('VIEW', 'INVOICE'),
  getInvoice
);
router.post(
  '/',
  invoiceValidation.create,
  validate,
  setActivityMeta('CREATE', 'INVOICE'),
  createInvoice
);
router.put(
  '/:id',
  invoiceValidation.update,
  validate,
  setActivityMeta('UPDATE', 'INVOICE'),
  updateInvoice
);
router.delete(
  '/:id',
  param('id').isMongoId().withMessage('Invalid invoice ID'),
  validate,
  setActivityMeta('DELETE', 'INVOICE'),
  deleteInvoice
);
router.get(
  '/:id/pdf',
  param('id').isMongoId().withMessage('Invalid invoice ID'),
  validate,
  setActivityMeta('GENERATE', 'INVOICE_PDF'),
  generateInvoicePDF
);
router.post(
  '/:id/send-email',
  invoiceValidation.sendEmail,
  validate,
  setActivityMeta('SEND', 'INVOICE_EMAIL'),
  sendInvoiceEmail
);
module.exports = router;
