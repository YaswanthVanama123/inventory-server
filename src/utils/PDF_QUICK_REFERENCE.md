# PDF Generator Quick Reference

## Quick Start

```javascript
const { generateInvoicePDF } = require('./utils/pdfGenerator');

const invoice = {
  invoiceNumber: 'INV-2026-001',
  invoiceDate: new Date(),
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  status: 'draft',
  currency: 'USD',

  company: {
    name: 'Your Company Name',
    email: 'info@company.com',
    phone: '+1 (555) 123-4567'
  },

  customer: {
    name: 'Customer Name',
    email: 'customer@example.com'
  },

  items: [
    {
      itemName: 'Product/Service',
      skuCode: 'SKU-001',
      quantity: 1,
      unitPrice: 100.00,
      total: 100.00
    }
  ],

  subtotal: 100.00,
  grandTotal: 100.00
};

// Generate PDF
const pdfBuffer = await generateInvoicePDF(invoice);

// Save to file
const fs = require('fs').promises;
await fs.writeFile('invoice.pdf', pdfBuffer);
```

## Express Route Example

```javascript
const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const { generateInvoicePDF } = require('../utils/pdfGenerator');

// Download invoice as PDF
router.get('/invoices/:id/pdf', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  const pdfBuffer = await generateInvoicePDF(invoice.toObject());

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  res.send(pdfBuffer);
});

// Preview invoice in browser
router.get('/invoices/:id/preview', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  const pdfBuffer = await generateInvoicePDF(invoice.toObject());

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
  res.send(pdfBuffer);
});

module.exports = router;
```

## Common Use Cases

### 1. Generate and Save PDF

```javascript
const invoice = await Invoice.findById(invoiceId);
const pdfBuffer = await generateInvoicePDF(invoice.toObject());
await fs.writeFile(`invoices/${invoice.invoiceNumber}.pdf`, pdfBuffer);
```

### 2. Email Invoice PDF

```javascript
const nodemailer = require('nodemailer');

const invoice = await Invoice.findById(invoiceId);
const pdfBuffer = await generateInvoicePDF(invoice.toObject());

await transporter.sendMail({
  to: invoice.customer.email,
  subject: `Invoice ${invoice.invoiceNumber}`,
  attachments: [{
    filename: `${invoice.invoiceNumber}.pdf`,
    content: pdfBuffer
  }]
});
```

### 3. Upload to Cloud Storage

```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const invoice = await Invoice.findById(invoiceId);
const pdfBuffer = await generateInvoicePDF(invoice.toObject());

await s3.putObject({
  Bucket: 'invoices-bucket',
  Key: `${invoice.invoiceNumber}.pdf`,
  Body: pdfBuffer,
  ContentType: 'application/pdf'
}).promise();
```

### 4. Bulk Download (ZIP)

```javascript
const archiver = require('archiver');

const invoices = await Invoice.find({ status: 'paid' });
const archive = archiver('zip');

archive.pipe(res);

for (const invoice of invoices) {
  const pdfBuffer = await generateInvoicePDF(invoice.toObject());
  archive.append(pdfBuffer, { name: `${invoice.invoiceNumber}.pdf` });
}

await archive.finalize();
```

## Invoice Data Structure (Minimal)

```javascript
{
  invoiceNumber: String,    // Required
  invoiceDate: Date,        // Required
  dueDate: Date,           // Required
  status: String,          // Required: draft|sent|paid|overdue|cancelled
  currency: String,        // Required: USD, EUR, GBP, etc.
  items: [{                // Required: at least 1 item
    itemName: String,      // Required
    quantity: Number,      // Required
    unitPrice: Number,     // Required
    total: Number          // Required
  }],
  subtotal: Number,        // Required
  grandTotal: Number       // Required
}
```

## Helper Functions

```javascript
// Format currency
const { formatCurrency } = require('./utils/pdfGenerator');
formatCurrency(1299.99, 'USD');  // "$1,299.99"

// Format date
const { formatDate } = require('./utils/pdfGenerator');
formatDate(new Date('2026-02-01'));  // "February 1, 2026"
```

## Supported Currencies

- USD ($) - US Dollar
- EUR (€) - Euro
- GBP (£) - British Pound
- INR (₹) - Indian Rupee
- JPY (¥) - Japanese Yen
- AUD (A$) - Australian Dollar
- CAD (C$) - Canadian Dollar

## Options

```javascript
generateInvoicePDF(invoice, {
  includeQR: true  // Include QR code (default: true)
})
```

## Error Handling

```javascript
try {
  const pdfBuffer = await generateInvoicePDF(invoice);
} catch (error) {
  if (error.message === 'Invoice data is required') {
    // Handle missing data
  } else if (error.message === 'Invoice must have at least one item') {
    // Handle empty items
  } else {
    // Handle other errors
  }
}
```

## Testing

```bash
# Run example
node src/utils/pdfGenerator.example.js

# Run test suite
node src/utils/pdfGenerator.test.js
```

## File Locations

- **Model**: `/server/src/models/Invoice.js`
- **Generator**: `/server/src/utils/pdfGenerator.js`
- **Examples**: `/server/src/utils/pdfGenerator.example.js`
- **Tests**: `/server/src/utils/pdfGenerator.test.js`
- **Routes**: `/server/src/utils/invoiceRoutes.example.js`
- **Controller**: `/server/src/utils/invoiceController.example.js`
- **Documentation**: `/server/src/utils/README_PDF_GENERATOR.md`
