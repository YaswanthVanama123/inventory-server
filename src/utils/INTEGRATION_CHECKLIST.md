# PDF Generator Integration Checklist

Use this checklist to integrate the PDF generator into your application.

## Prerequisites

- [x] Node.js installed
- [x] Express.js application running
- [x] MongoDB connected
- [x] Dependencies installed (pdfkit, qrcode)

## Step-by-Step Integration

### Step 1: Verify Installation

```bash
# Check if dependencies are installed
npm list pdfkit qrcode

# If not installed:
npm install pdfkit qrcode
```

- [x] pdfkit installed
- [x] qrcode installed

### Step 2: Set Up Invoice Model

```javascript
// In your application
const Invoice = require('./models/Invoice');

// Test that model is working
const testInvoice = new Invoice({
  invoiceNumber: 'TEST-001',
  // ... other required fields
});
```

- [ ] Invoice model imported
- [ ] Model schema reviewed
- [ ] Test invoice created (optional)

### Step 3: Import PDF Generator

```javascript
// In your controller or route file
const { generateInvoicePDF } = require('./utils/pdfGenerator');
```

- [ ] PDF generator imported
- [ ] Helper functions imported (if needed)

### Step 4: Create Routes

```javascript
// In routes/invoiceRoutes.js or similar
const express = require('express');
const router = express.Router();

// Import middleware
const { protect } = require('../middleware/auth');

// Import controller functions
const { downloadInvoicePDF, previewInvoicePDF } = require('../controllers/invoiceController');

// Define routes
router.get('/:id/pdf', protect, downloadInvoicePDF);
router.get('/:id/preview', protect, previewInvoicePDF);

module.exports = router;
```

- [ ] Routes file created
- [ ] Authentication middleware added
- [ ] Routes exported

### Step 5: Create Controller Functions

```javascript
// In controllers/invoiceController.js
const Invoice = require('../models/Invoice');
const { generateInvoicePDF } = require('../utils/pdfGenerator');

const downloadInvoicePDF = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const pdfBuffer = await generateInvoicePDF(invoice.toObject());

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};

module.exports = { downloadInvoicePDF };
```

- [ ] Controller file created
- [ ] Error handling implemented
- [ ] Response headers configured
- [ ] Functions exported

### Step 6: Register Routes in Main App

```javascript
// In server.js or app.js
const invoiceRoutes = require('./routes/invoiceRoutes');

app.use('/api/invoices', invoiceRoutes);
```

- [ ] Routes imported
- [ ] Routes registered with app
- [ ] Correct base path used

### Step 7: Test PDF Generation

```bash
# Run the example script
node src/utils/pdfGenerator.example.js

# Check if PDF was created
ls temp/INV-2026-001.pdf
```

- [ ] Example script runs successfully
- [ ] PDF file created
- [ ] PDF opens correctly

### Step 8: Test API Endpoints

```bash
# Test download endpoint
curl -X GET http://localhost:3000/api/invoices/{invoice_id}/pdf \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output test-invoice.pdf

# Test preview endpoint
curl -X GET http://localhost:3000/api/invoices/{invoice_id}/preview \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output test-preview.pdf
```

- [ ] Download endpoint works
- [ ] Preview endpoint works
- [ ] Authentication required
- [ ] PDFs generate correctly

### Step 9: Frontend Integration (Optional)

```javascript
// React/Vue/Angular example
const downloadInvoice = async (invoiceId) => {
  try {
    const response = await fetch(`/api/invoices/${invoiceId}/pdf`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoiceId}.pdf`;
    a.click();
  } catch (error) {
    console.error('Error downloading invoice:', error);
  }
};
```

- [ ] Frontend download function created
- [ ] Preview function created (if needed)
- [ ] UI buttons added
- [ ] Error handling implemented

### Step 10: Email Integration (Optional)

```javascript
// In your email service or controller
const nodemailer = require('nodemailer');
const { generateInvoicePDF } = require('./utils/pdfGenerator');

const emailInvoice = async (invoiceId, recipientEmail) => {
  const invoice = await Invoice.findById(invoiceId);
  const pdfBuffer = await generateInvoicePDF(invoice.toObject());

  await transporter.sendMail({
    to: recipientEmail,
    subject: `Invoice ${invoice.invoiceNumber}`,
    attachments: [{
      filename: `${invoice.invoiceNumber}.pdf`,
      content: pdfBuffer
    }]
  });
};
```

- [ ] Email service configured
- [ ] PDF attachment working
- [ ] Email template created
- [ ] Test email sent

### Step 11: Cloud Storage Integration (Optional)

```javascript
// AWS S3 example
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const saveInvoiceToS3 = async (invoice) => {
  const pdfBuffer = await generateInvoicePDF(invoice.toObject());

  await s3.putObject({
    Bucket: 'invoices-bucket',
    Key: `invoices/${invoice.invoiceNumber}.pdf`,
    Body: pdfBuffer,
    ContentType: 'application/pdf'
  }).promise();
};
```

- [ ] Cloud storage configured
- [ ] Upload function created
- [ ] Permissions set correctly
- [ ] Test upload successful

### Step 12: Run Test Suite

```bash
# Run comprehensive tests
node src/utils/pdfGenerator.test.js
```

- [ ] All tests passing
- [ ] No errors or warnings
- [ ] Test PDFs generated

## Customization Checklist

### Branding

- [ ] Add company logo
- [ ] Update company colors
- [ ] Customize fonts
- [ ] Update footer text

### Invoice Data

- [ ] Review required fields
- [ ] Add custom fields (if needed)
- [ ] Update validation rules
- [ ] Test with real data

### Layout

- [ ] Adjust margins
- [ ] Modify column widths
- [ ] Change font sizes
- [ ] Update spacing

### Features

- [ ] Enable/disable QR code
- [ ] Add watermarks
- [ ] Include terms and conditions
- [ ] Add payment instructions

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Error handling tested
- [ ] Security review completed
- [ ] Performance tested
- [ ] Documentation reviewed

### Environment Variables

```bash
# Add to .env file if needed
INVOICE_LOGO_PATH=/path/to/logo.png
INVOICE_QR_ENABLED=true
PDF_STORAGE_PATH=/path/to/pdfs
```

- [ ] Environment variables configured
- [ ] Production values set
- [ ] Secrets secured

### Production

- [ ] Deploy to production server
- [ ] Test in production
- [ ] Monitor error logs
- [ ] Set up alerts
- [ ] Document any issues

## Common Issues & Solutions

### Issue 1: "Cannot find module 'pdfkit'"
**Solution**: Run `npm install pdfkit qrcode`

### Issue 2: PDF is blank or incomplete
**Solution**: Check invoice data structure matches schema

### Issue 3: "Invoice data is required" error
**Solution**: Ensure invoice object is passed to generator

### Issue 4: Logo not appearing
**Solution**: Check logo path and file exists

### Issue 5: Currency not formatting correctly
**Solution**: Verify currency code is supported

### Issue 6: PDF download triggers but file is corrupted
**Solution**: Check response headers and Content-Type

### Issue 7: QR code not generating
**Solution**: Verify qrcode package is installed

### Issue 8: Multi-page invoices not working
**Solution**: Check item count and page break logic

## Support & Resources

### Documentation Files

- **Full Documentation**: `/server/src/utils/README_PDF_GENERATOR.md`
- **Quick Reference**: `/server/src/utils/PDF_QUICK_REFERENCE.md`
- **Architecture**: `/server/src/utils/ARCHITECTURE.md`
- **This Checklist**: `/server/src/utils/INTEGRATION_CHECKLIST.md`

### Example Files

- **Usage Examples**: `/server/src/utils/pdfGenerator.example.js`
- **Controller Examples**: `/server/src/utils/invoiceController.example.js`
- **Route Examples**: `/server/src/utils/invoiceRoutes.example.js`

### Testing

- **Test Suite**: `/server/src/utils/pdfGenerator.test.js`
- **Sample PDFs**: `/server/temp/` and `/server/temp/tests/`

### Need Help?

1. Check the documentation files above
2. Review example files
3. Run test suite to verify setup
4. Check console for error messages
5. Review invoice data structure

## Success Criteria

You've successfully integrated the PDF generator when:

- [ ] PDFs generate without errors
- [ ] Download endpoint works
- [ ] Preview endpoint works
- [ ] Email integration works (if implemented)
- [ ] Cloud storage works (if implemented)
- [ ] All tests passing
- [ ] Production deployment successful
- [ ] No performance issues
- [ ] Users can download invoices
- [ ] PDFs look professional

## Next Steps

After successful integration:

1. **Monitor Usage**
   - Track PDF generation requests
   - Monitor error rates
   - Check performance metrics

2. **Gather Feedback**
   - User satisfaction
   - PDF quality
   - Feature requests

3. **Optimize**
   - Caching frequently accessed invoices
   - Batch processing for bulk operations
   - Performance improvements

4. **Enhance**
   - Add custom templates
   - Implement localization
   - Add digital signatures
   - Integrate payment links

---

**Congratulations!** You now have a fully functional, professional invoice PDF generation system.
