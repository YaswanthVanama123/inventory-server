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


router.use(authenticate);
router.use(requireAdmin());


router.get('/items/grouped', getGroupedInvoiceItems);


router.get('/stats', getInvoiceStats);


router.get('/', getAllInvoices);


router.get(
  '/:id',
  param('id').isMongoId().withMessage('Invalid invoice ID'),
  validate,
  getInvoice
);


router.post(
  '/',
  invoiceValidation.create,
  validate,
  createInvoice
);


router.put(
  '/:id',
  invoiceValidation.update,
  validate,
  updateInvoice
);


router.delete(
  '/:id',
  param('id').isMongoId().withMessage('Invalid invoice ID'),
  validate,
  deleteInvoice
);


router.get(
  '/:id/pdf',
  param('id').isMongoId().withMessage('Invalid invoice ID'),
  validate,
  generateInvoicePDF
);


router.post(
  '/:id/send-email',
  invoiceValidation.sendEmail,
  validate,
  sendInvoiceEmail
);

module.exports = router;
