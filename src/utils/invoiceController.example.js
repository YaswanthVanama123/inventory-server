/**
 * Invoice Controller Integration Example
 * Shows how to integrate the PDF generator with Express routes
 */

const Invoice = require('../models/Invoice');
const { generateInvoicePDF } = require('../utils/pdfGenerator');

/**
 * @route   GET /api/invoices/:id/pdf
 * @desc    Generate and download invoice PDF
 * @access  Private
 */
const downloadInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    // Check if invoice is active
    if (!invoice.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Invoice has been deleted'
      });
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
      includeQR: true
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.invoiceNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice PDF'
    });
  }
};

/**
 * @route   GET /api/invoices/:id/preview
 * @desc    Preview invoice PDF in browser (inline display)
 * @access  Private
 */
const previewInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
      includeQR: true
    });

    // Set response headers for inline display
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${invoice.invoiceNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error previewing invoice PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to preview invoice PDF'
    });
  }
};

/**
 * @route   POST /api/invoices/:id/email
 * @desc    Generate PDF and send via email
 * @access  Private
 */
const emailInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;
    const { recipientEmail } = req.body;

    // Find invoice
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    // Use customer email if no recipient specified
    const emailTo = recipientEmail || invoice.customer.email;

    if (!emailTo) {
      return res.status(400).json({
        success: false,
        error: 'No recipient email address provided'
      });
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
      includeQR: true
    });

    // Send email (using your email service)
    // const emailService = require('../utils/emailService');
    // await emailService.sendEmail({
    //   to: emailTo,
    //   subject: `Invoice ${invoice.invoiceNumber} from ${invoice.company.name}`,
    //   text: `Please find attached invoice ${invoice.invoiceNumber}`,
    //   html: `<p>Dear ${invoice.customer.name},</p>
    //          <p>Please find attached invoice ${invoice.invoiceNumber}.</p>
    //          <p>Amount due: ${invoice.grandTotal} ${invoice.currency}</p>
    //          <p>Due date: ${new Date(invoice.dueDate).toLocaleDateString()}</p>`,
    //   attachments: [{
    //     filename: `${invoice.invoiceNumber}.pdf`,
    //     content: pdfBuffer
    //   }]
    // });

    // Update invoice status
    if (invoice.status === 'draft') {
      invoice.status = 'sent';
      invoice.lastUpdatedBy = req.user._id;
      await invoice.save();
    }

    res.json({
      success: true,
      message: `Invoice emailed successfully to ${emailTo}`,
      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status
      }
    });

  } catch (error) {
    console.error('Error emailing invoice PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to email invoice PDF'
    });
  }
};

/**
 * @route   POST /api/invoices/:id/save-pdf
 * @desc    Generate and save PDF to server/cloud storage
 * @access  Private
 */
const saveInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;
    const fs = require('fs').promises;
    const path = require('path');

    // Find invoice
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
      includeQR: true
    });

    // Save to local storage (adjust path as needed)
    const uploadsDir = path.join(__dirname, '../../uploads/invoices');
    await fs.mkdir(uploadsDir, { recursive: true });

    const filename = `${invoice.invoiceNumber}.pdf`;
    const filepath = path.join(uploadsDir, filename);

    await fs.writeFile(filepath, pdfBuffer);

    // Optionally, upload to cloud storage (S3, Azure Blob, etc.)
    // const cloudStorage = require('../utils/cloudStorage');
    // const cloudUrl = await cloudStorage.upload(pdfBuffer, filename);

    res.json({
      success: true,
      message: 'Invoice PDF saved successfully',
      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        pdfPath: filepath
        // cloudUrl: cloudUrl // if using cloud storage
      }
    });

  } catch (error) {
    console.error('Error saving invoice PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save invoice PDF'
    });
  }
};

/**
 * @route   POST /api/invoices/bulk-download
 * @desc    Generate and download multiple invoices as ZIP
 * @access  Private
 */
const bulkDownloadInvoices = async (req, res) => {
  try {
    const { invoiceIds } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invoice IDs array is required'
      });
    }

    // Find all invoices
    const invoices = await Invoice.find({
      _id: { $in: invoiceIds },
      isActive: true
    });

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No invoices found'
      });
    }

    // Generate PDFs for all invoices
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoices-${Date.now()}.zip"`
    );

    // Pipe archive to response
    archive.pipe(res);

    // Generate and add each PDF to archive
    for (const invoice of invoices) {
      const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
        includeQR: true
      });

      archive.append(pdfBuffer, {
        name: `${invoice.invoiceNumber}.pdf`
      });
    }

    // Finalize the archive
    await archive.finalize();

  } catch (error) {
    console.error('Error bulk downloading invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk download invoices'
    });
  }
};

module.exports = {
  downloadInvoicePDF,
  previewInvoicePDF,
  emailInvoicePDF,
  saveInvoicePDF,
  bulkDownloadInvoices
};
