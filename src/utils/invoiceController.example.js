

const Invoice = require('../models/Invoice');
const { generateInvoicePDF } = require('../utils/pdfGenerator');


const downloadInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;

    
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    
    if (!invoice.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Invoice has been deleted'
      });
    }

    
    const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
      includeQR: true
    });

    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.invoiceNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice PDF'
    });
  }
};


const previewInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;

    
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    
    const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
      includeQR: true
    });

    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${invoice.invoiceNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error previewing invoice PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to preview invoice PDF'
    });
  }
};


const emailInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;
    const { recipientEmail } = req.body;

    
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    
    const emailTo = recipientEmail || invoice.customer.email;

    if (!emailTo) {
      return res.status(400).json({
        success: false,
        error: 'No recipient email address provided'
      });
    }

    
    const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
      includeQR: true
    });

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
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


const saveInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;
    const fs = require('fs').promises;
    const path = require('path');

    
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    
    const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
      includeQR: true
    });

    
    const uploadsDir = path.join(__dirname, '../../uploads/invoices');
    await fs.mkdir(uploadsDir, { recursive: true });

    const filename = `${invoice.invoiceNumber}.pdf`;
    const filepath = path.join(uploadsDir, filename);

    await fs.writeFile(filepath, pdfBuffer);

    
    
    

    res.json({
      success: true,
      message: 'Invoice PDF saved successfully',
      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        pdfPath: filepath
        
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


const bulkDownloadInvoices = async (req, res) => {
  try {
    const { invoiceIds } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invoice IDs array is required'
      });
    }

    
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

    
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });

    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoices-${Date.now()}.zip"`
    );

    
    archive.pipe(res);

    
    for (const invoice of invoices) {
      const pdfBuffer = await generateInvoicePDF(invoice.toObject(), {
        includeQR: true
      });

      archive.append(pdfBuffer, {
        name: `${invoice.invoiceNumber}.pdf`
      });
    }

    
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
