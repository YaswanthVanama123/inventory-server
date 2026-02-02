/**
 * Example usage of the PDF Generator utility
 * This file demonstrates how to use the generateInvoicePDF function
 */

const { generateInvoicePDF } = require('./pdfGenerator');
const fs = require('fs').promises;
const path = require('path');

// Sample invoice data
const sampleInvoice = {
  invoiceNumber: 'INV-2026-001',
  invoiceDate: new Date('2026-02-01'),
  dueDate: new Date('2026-03-03'), // Net 30 days
  status: 'sent',
  currency: 'USD',

  company: {
    name: 'Acme Corporation',
    email: 'billing@acmecorp.com',
    phone: '+1 (555) 123-4567',
    website: 'www.acmecorp.com',
    address: {
      street: '123 Business Street',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA'
    }
    // logo: '/path/to/company-logo.png' // Optional: path to logo image
  },

  customer: {
    name: 'Global Tech Solutions Inc.',
    email: 'accounts@globaltech.com',
    phone: '+1 (555) 987-6543',
    address: {
      street: '456 Tech Avenue',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      country: 'USA'
    }
  },

  items: [
    {
      itemName: 'Laptop Computer - Dell XPS 15',
      skuCode: 'DELL-XPS15-001',
      description: 'High-performance laptop with Intel i7, 16GB RAM, 512GB SSD',
      quantity: 5,
      unitPrice: 1299.99,
      total: 6499.95
    },
    {
      itemName: 'Wireless Mouse',
      skuCode: 'MOUSE-WL-001',
      description: 'Ergonomic wireless mouse with USB receiver',
      quantity: 10,
      unitPrice: 29.99,
      total: 299.90
    },
    {
      itemName: 'USB-C Hub Adapter',
      skuCode: 'HUB-USBC-001',
      description: '7-in-1 USB-C hub with HDMI, USB 3.0, SD card reader',
      quantity: 5,
      unitPrice: 49.99,
      total: 249.95
    },
    {
      itemName: 'External Hard Drive 2TB',
      skuCode: 'HDD-EXT-2TB',
      description: 'Portable external hard drive with USB 3.0',
      quantity: 3,
      unitPrice: 89.99,
      total: 269.97
    },
    {
      itemName: 'Laptop Bag - Premium',
      skuCode: 'BAG-LAPTOP-PRO',
      description: 'Water-resistant laptop bag with multiple compartments',
      quantity: 5,
      unitPrice: 79.99,
      total: 399.95
    }
  ],

  subtotal: 7719.72,

  discount: {
    type: 'percentage',
    value: 10,
    amount: 771.97
  },

  tax: {
    rate: 8.5,
    amount: 590.56
  },

  grandTotal: 7538.31,

  paymentTerms: 'Net 30 - Payment is due within 30 days of invoice date. Accepted payment methods: Bank Transfer, Credit Card, PayPal. Late payments may incur a 1.5% monthly interest charge.',

  notes: 'Thank you for your business! Please include the invoice number with your payment.\n\nFor any questions regarding this invoice, please contact our billing department at billing@acmecorp.com or call +1 (555) 123-4567.\n\nAll sales are final. Returns accepted within 30 days with original receipt.'
};

/**
 * Generate and save a sample invoice PDF
 */
async function generateSampleInvoice() {
  try {
    console.log('Generating invoice PDF...');

    // Generate PDF buffer
    const pdfBuffer = await generateInvoicePDF(sampleInvoice, {
      includeQR: true // Include QR code
    });

    // Save to file
    const outputPath = path.join(__dirname, '../../temp', `${sampleInvoice.invoiceNumber}.pdf`);

    // Ensure temp directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write PDF to file
    await fs.writeFile(outputPath, pdfBuffer);

    console.log(`✓ Invoice PDF generated successfully!`);
    console.log(`✓ Saved to: ${outputPath}`);
    console.log(`✓ File size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

    return pdfBuffer;
  } catch (error) {
    console.error('Error generating invoice:', error);
    throw error;
  }
}

/**
 * Example: Using with Mongoose Invoice model
 */
async function generateInvoiceFromDB(invoiceId) {
  try {
    // This is a placeholder - in real usage, you would:
    // const Invoice = require('../models/Invoice');
    // const invoice = await Invoice.findById(invoiceId).populate('createdBy');

    // For now, we'll use the sample data
    const invoice = sampleInvoice;

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice, {
      includeQR: true
    });

    return pdfBuffer;
  } catch (error) {
    console.error('Error generating invoice from database:', error);
    throw error;
  }
}

/**
 * Example: Sending invoice via email (pseudo-code)
 */
async function generateAndEmailInvoice(invoice, recipientEmail) {
  try {
    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice);

    // In a real application, you would use a mail service like nodemailer:
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({...});
    //
    // await transporter.sendMail({
    //   from: invoice.company.email,
    //   to: recipientEmail,
    //   subject: `Invoice ${invoice.invoiceNumber}`,
    //   text: `Please find attached invoice ${invoice.invoiceNumber}`,
    //   attachments: [{
    //     filename: `${invoice.invoiceNumber}.pdf`,
    //     content: pdfBuffer
    //   }]
    // });

    console.log(`Invoice would be emailed to: ${recipientEmail}`);
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating and emailing invoice:', error);
    throw error;
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  generateSampleInvoice()
    .then(() => {
      console.log('\nExample completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nExample failed:', error);
      process.exit(1);
    });
}

module.exports = {
  generateSampleInvoice,
  generateInvoiceFromDB,
  generateAndEmailInvoice,
  sampleInvoice
};
