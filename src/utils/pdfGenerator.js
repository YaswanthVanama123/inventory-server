const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

/**
 * PDF Generator Utility for Invoices
 * Generates professional invoice PDFs with company branding, itemized tables, and financial calculations
 */

// Constants for PDF layout
const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

// Color scheme
const COLORS = {
  primary: '#2c3e50',
  secondary: '#3498db',
  accent: '#e74c3c',
  text: '#2c3e50',
  lightGray: '#ecf0f1',
  gray: '#95a5a6',
  darkGray: '#7f8c8d',
  white: '#ffffff'
};

/**
 * Format currency with symbol and proper decimal places
 * @param {number} amount - The amount to format
 * @param {string} currency - Currency code (USD, EUR, etc.)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = 'USD') {
  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$'
  };

  const symbol = symbols[currency] || currency;
  const formattedAmount = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${symbol}${formattedAmount}`;
}

/**
 * Format date in a readable format
 * @param {Date|string} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const d = new Date(date);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString('en-US', options);
}

/**
 * Draw a horizontal line
 * @param {PDFDocument} doc - PDF document instance
 * @param {number} y - Y position
 * @param {string} color - Line color
 * @param {number} width - Line width
 */
function drawLine(doc, y, color = COLORS.lightGray, width = 1) {
  doc
    .strokeColor(color)
    .lineWidth(width)
    .moveTo(MARGIN, y)
    .lineTo(PAGE_WIDTH - MARGIN, y)
    .stroke();
}

/**
 * Draw company header with logo placeholder and company info
 * @param {PDFDocument} doc - PDF document instance
 * @param {object} company - Company information
 * @returns {number} Y position after header
 */
function drawHeader(doc, company) {
  let y = MARGIN;

  // Company logo placeholder (if logo path is provided)
  if (company.logo) {
    try {
      doc.image(company.logo, MARGIN, y, { width: 120, height: 60 });
    } catch (error) {
      // If logo can't be loaded, draw a placeholder box
      doc
        .rect(MARGIN, y, 120, 60)
        .fillAndStroke(COLORS.lightGray, COLORS.gray);
    }
  } else {
    // Draw logo placeholder
    doc
      .rect(MARGIN, y, 120, 60)
      .fillAndStroke(COLORS.lightGray, COLORS.gray);

    doc
      .fontSize(10)
      .fillColor(COLORS.gray)
      .text('LOGO', MARGIN + 45, y + 25);
  }

  // Company name and info (right aligned)
  const rightColumnX = PAGE_WIDTH - MARGIN - 200;

  doc
    .fontSize(16)
    .fillColor(COLORS.primary)
    .font('Helvetica-Bold')
    .text(company.name || 'Your Company Name', rightColumnX, y, {
      width: 200,
      align: 'right'
    });

  y += 20;

  doc
    .fontSize(9)
    .fillColor(COLORS.text)
    .font('Helvetica');

  if (company.address) {
    const addressParts = [];
    if (company.address.street) addressParts.push(company.address.street);
    if (company.address.city) addressParts.push(company.address.city);
    if (company.address.state) addressParts.push(company.address.state);
    if (company.address.zipCode) addressParts.push(company.address.zipCode);
    if (company.address.country) addressParts.push(company.address.country);

    doc.text(addressParts.join(', '), rightColumnX, y, {
      width: 200,
      align: 'right',
      lineGap: 2
    });

    y += addressParts.length * 12;
  }

  if (company.phone) {
    doc.text(`Phone: ${company.phone}`, rightColumnX, y, {
      width: 200,
      align: 'right'
    });
    y += 12;
  }

  if (company.email) {
    doc.text(`Email: ${company.email}`, rightColumnX, y, {
      width: 200,
      align: 'right'
    });
    y += 12;
  }

  if (company.website) {
    doc.text(`Website: ${company.website}`, rightColumnX, y, {
      width: 200,
      align: 'right'
    });
    y += 12;
  }

  return Math.max(y + 30, MARGIN + 100);
}

/**
 * Draw invoice title and metadata
 * @param {PDFDocument} doc - PDF document instance
 * @param {object} invoice - Invoice data
 * @param {number} startY - Starting Y position
 * @returns {number} Y position after title section
 */
function drawInvoiceTitle(doc, invoice, startY) {
  let y = startY;

  // INVOICE title
  doc
    .fontSize(28)
    .fillColor(COLORS.primary)
    .font('Helvetica-Bold')
    .text('INVOICE', MARGIN, y);

  y += 40;

  // Invoice metadata (2 columns)
  const leftColX = MARGIN;
  const rightColX = PAGE_WIDTH - MARGIN - 200;

  doc
    .fontSize(10)
    .fillColor(COLORS.text)
    .font('Helvetica-Bold');

  // Left column
  doc.text('Invoice Number:', leftColX, y);
  doc
    .font('Helvetica')
    .text(invoice.invoiceNumber || 'N/A', leftColX + 100, y);

  y += 15;

  doc
    .font('Helvetica-Bold')
    .text('Invoice Date:', leftColX, y);
  doc
    .font('Helvetica')
    .text(formatDate(invoice.invoiceDate), leftColX + 100, y);

  // Reset y for right column
  y = startY + 40;

  // Right column
  doc
    .font('Helvetica-Bold')
    .text('Due Date:', rightColX, y);
  doc
    .font('Helvetica')
    .text(formatDate(invoice.dueDate), rightColX + 70, y);

  y += 15;

  // Status badge
  const statusColors = {
    draft: COLORS.gray,
    sent: COLORS.secondary,
    paid: '#27ae60',
    overdue: COLORS.accent,
    cancelled: COLORS.darkGray
  };

  const statusColor = statusColors[invoice.status] || COLORS.gray;

  doc
    .font('Helvetica-Bold')
    .text('Status:', rightColX, y);

  doc
    .fillColor(statusColor)
    .text(invoice.status ? invoice.status.toUpperCase() : 'DRAFT', rightColX + 70, y);

  return y + 40;
}

/**
 * Draw customer billing details
 * @param {PDFDocument} doc - PDF document instance
 * @param {object} customer - Customer information
 * @param {number} startY - Starting Y position
 * @returns {number} Y position after customer section
 */
function drawCustomerDetails(doc, customer, startY) {
  let y = startY;

  // Section title
  doc
    .fontSize(12)
    .fillColor(COLORS.primary)
    .font('Helvetica-Bold')
    .text('BILL TO:', MARGIN, y);

  y += 20;

  // Customer name
  doc
    .fontSize(11)
    .fillColor(COLORS.text)
    .font('Helvetica-Bold')
    .text(customer.name || 'Customer Name', MARGIN, y);

  y += 15;

  // Customer details
  doc
    .fontSize(9)
    .font('Helvetica');

  if (customer.address) {
    const addressParts = [];
    if (customer.address.street) addressParts.push(customer.address.street);
    if (customer.address.city) addressParts.push(customer.address.city);
    if (customer.address.state) addressParts.push(customer.address.state);
    if (customer.address.zipCode) addressParts.push(customer.address.zipCode);
    if (customer.address.country) addressParts.push(customer.address.country);

    doc.text(addressParts.join(', '), MARGIN, y, {
      width: 250,
      lineGap: 2
    });

    y += Math.max(addressParts.length * 12, 20);
  }

  if (customer.email) {
    doc.text(`Email: ${customer.email}`, MARGIN, y);
    y += 12;
  }

  if (customer.phone) {
    doc.text(`Phone: ${customer.phone}`, MARGIN, y);
    y += 12;
  }

  return y + 20;
}

/**
 * Draw items table with headers and data
 * @param {PDFDocument} doc - PDF document instance
 * @param {array} items - Invoice items
 * @param {string} currency - Currency code
 * @param {number} startY - Starting Y position
 * @returns {number} Y position after table
 */
function drawItemsTable(doc, items, currency, startY) {
  let y = startY;

  // Table header background
  doc
    .rect(MARGIN, y, CONTENT_WIDTH, 25)
    .fillAndStroke(COLORS.primary, COLORS.primary);

  // Table headers
  const colWidths = {
    item: 160,
    sku: 80,
    qty: 50,
    unitPrice: 80,
    total: 90
  };

  let x = MARGIN + 10;

  doc
    .fontSize(9)
    .fillColor(COLORS.white)
    .font('Helvetica-Bold');

  doc.text('ITEM / DESCRIPTION', x, y + 8);
  x += colWidths.item;

  doc.text('SKU', x, y + 8);
  x += colWidths.sku;

  doc.text('QTY', x, y + 8, { width: colWidths.qty, align: 'center' });
  x += colWidths.qty;

  doc.text('UNIT PRICE', x, y + 8, { width: colWidths.unitPrice, align: 'right' });
  x += colWidths.unitPrice;

  doc.text('TOTAL', x, y + 8, { width: colWidths.total, align: 'right' });

  y += 25;

  // Table rows
  doc
    .fillColor(COLORS.text)
    .font('Helvetica');

  items.forEach((item, index) => {
    // Check if we need a new page
    if (y > PAGE_HEIGHT - 200) {
      doc.addPage();
      y = MARGIN;
    }

    // Alternate row background
    if (index % 2 === 0) {
      doc
        .rect(MARGIN, y, CONTENT_WIDTH, 30)
        .fillAndStroke(COLORS.lightGray, COLORS.lightGray);
    }

    x = MARGIN + 10;
    const rowY = y + 8;

    // Item name and description
    doc
      .fontSize(9)
      .fillColor(COLORS.text)
      .font('Helvetica-Bold')
      .text(item.itemName, x, rowY, { width: colWidths.item - 10 });

    if (item.description) {
      doc
        .fontSize(7)
        .fillColor(COLORS.darkGray)
        .font('Helvetica')
        .text(item.description, x, rowY + 11, {
          width: colWidths.item - 10,
          lineGap: 1
        });
    }

    x += colWidths.item;

    // SKU
    doc
      .fontSize(8)
      .fillColor(COLORS.text)
      .font('Helvetica')
      .text(item.skuCode || '-', x, rowY + 5);
    x += colWidths.sku;

    // Quantity
    doc.text(item.quantity.toString(), x, rowY + 5, {
      width: colWidths.qty,
      align: 'center'
    });
    x += colWidths.qty;

    // Unit price
    doc.text(formatCurrency(item.unitPrice, currency), x, rowY + 5, {
      width: colWidths.unitPrice,
      align: 'right'
    });
    x += colWidths.unitPrice;

    // Total
    doc
      .font('Helvetica-Bold')
      .text(formatCurrency(item.total, currency), x, rowY + 5, {
        width: colWidths.total,
        align: 'right'
      });

    y += 30;
  });

  // Draw bottom border
  drawLine(doc, y, COLORS.gray, 1);

  return y + 10;
}

/**
 * Draw financial summary (subtotal, tax, discount, total)
 * @param {PDFDocument} doc - PDF document instance
 * @param {object} invoice - Invoice data
 * @param {number} startY - Starting Y position
 * @returns {number} Y position after summary
 */
function drawFinancialSummary(doc, invoice, startY) {
  let y = startY;

  const labelX = PAGE_WIDTH - MARGIN - 250;
  const valueX = PAGE_WIDTH - MARGIN - 100;

  doc
    .fontSize(10)
    .fillColor(COLORS.text)
    .font('Helvetica');

  // Subtotal
  doc.text('Subtotal:', labelX, y, { width: 150, align: 'right' });
  doc
    .font('Helvetica-Bold')
    .text(formatCurrency(invoice.subtotal, invoice.currency), valueX, y, {
      width: 100,
      align: 'right'
    });

  y += 20;

  // Discount (if applicable)
  if (invoice.discount && invoice.discount.amount > 0) {
    doc
      .font('Helvetica')
      .fillColor(COLORS.accent);

    const discountLabel = invoice.discount.type === 'percentage'
      ? `Discount (${invoice.discount.value}%):`
      : 'Discount:';

    doc.text(discountLabel, labelX, y, { width: 150, align: 'right' });
    doc
      .font('Helvetica-Bold')
      .text(`-${formatCurrency(invoice.discount.amount, invoice.currency)}`, valueX, y, {
        width: 100,
        align: 'right'
      });

    y += 20;
  }

  // Tax
  doc
    .font('Helvetica')
    .fillColor(COLORS.text);

  const taxLabel = invoice.tax && invoice.tax.rate
    ? `Tax (${invoice.tax.rate}%):`
    : 'Tax:';

  doc.text(taxLabel, labelX, y, { width: 150, align: 'right' });
  doc
    .font('Helvetica-Bold')
    .text(formatCurrency(invoice.tax?.amount || 0, invoice.currency), valueX, y, {
      width: 100,
      align: 'right'
    });

  y += 25;

  // Draw line before grand total
  drawLine(doc, y, COLORS.gray, 1);

  y += 15;

  // Grand Total
  doc
    .fontSize(14)
    .fillColor(COLORS.primary)
    .font('Helvetica-Bold');

  doc.text('GRAND TOTAL:', labelX, y, { width: 150, align: 'right' });
  doc.text(formatCurrency(invoice.grandTotal, invoice.currency), valueX, y, {
    width: 100,
    align: 'right'
  });

  return y + 40;
}

/**
 * Draw payment terms and notes
 * @param {PDFDocument} doc - PDF document instance
 * @param {object} invoice - Invoice data
 * @param {number} startY - Starting Y position
 * @returns {number} Y position after notes section
 */
function drawNotesAndTerms(doc, invoice, startY) {
  let y = startY;

  // Payment terms
  if (invoice.paymentTerms) {
    doc
      .fontSize(10)
      .fillColor(COLORS.primary)
      .font('Helvetica-Bold')
      .text('PAYMENT TERMS:', MARGIN, y);

    y += 15;

    doc
      .fontSize(9)
      .fillColor(COLORS.text)
      .font('Helvetica')
      .text(invoice.paymentTerms, MARGIN, y, { width: CONTENT_WIDTH });

    y += 30;
  }

  // Notes
  if (invoice.notes) {
    doc
      .fontSize(10)
      .fillColor(COLORS.primary)
      .font('Helvetica-Bold')
      .text('NOTES:', MARGIN, y);

    y += 15;

    doc
      .fontSize(9)
      .fillColor(COLORS.text)
      .font('Helvetica')
      .text(invoice.notes, MARGIN, y, {
        width: CONTENT_WIDTH,
        lineGap: 3
      });

    y += Math.max(invoice.notes.split('\n').length * 12, 30);
  }

  return y;
}

/**
 * Add QR code to the PDF (optional)
 * @param {PDFDocument} doc - PDF document instance
 * @param {object} invoice - Invoice data
 * @param {number} x - X position
 * @param {number} y - Y position
 */
async function addQRCode(doc, invoice, x, y) {
  try {
    // Generate QR code data URL
    const qrData = JSON.stringify({
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.grandTotal,
      currency: invoice.currency,
      date: invoice.invoiceDate
    });

    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      width: 100,
      margin: 1,
      color: {
        dark: COLORS.primary,
        light: COLORS.white
      }
    });

    // Add QR code to PDF
    doc.image(qrCodeDataURL, x, y, { width: 80, height: 80 });

    // Add label
    doc
      .fontSize(7)
      .fillColor(COLORS.gray)
      .text('Scan to verify', x, y + 85, { width: 80, align: 'center' });
  } catch (error) {
    console.error('Error generating QR code:', error);
  }
}

/**
 * Draw footer with company information and page numbers
 * @param {PDFDocument} doc - PDF document instance
 * @param {object} company - Company information
 */
function drawFooter(doc, company) {
  const footerY = PAGE_HEIGHT - MARGIN;

  // Draw top line
  drawLine(doc, footerY - 30, COLORS.gray, 1);

  // Footer text
  doc
    .fontSize(8)
    .fillColor(COLORS.darkGray)
    .font('Helvetica');

  const footerText = `${company.name || 'Your Company'} | ${company.email || ''} | ${company.phone || ''}`;

  doc.text(footerText, MARGIN, footerY - 20, {
    width: CONTENT_WIDTH,
    align: 'center'
  });

  // Page number
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.text(
      `Page ${i + 1} of ${range.count}`,
      MARGIN,
      footerY - 5,
      { width: CONTENT_WIDTH, align: 'center' }
    );
  }
}

/**
 * Main function to generate invoice PDF
 * @param {object} invoice - Complete invoice data object
 * @param {object} options - Generation options
 * @param {boolean} options.includeQR - Whether to include QR code (default: true)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateInvoicePDF(invoice, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      // Validate invoice data
      if (!invoice) {
        throw new Error('Invoice data is required');
      }

      if (!invoice.items || invoice.items.length === 0) {
        throw new Error('Invoice must have at least one item');
      }

      // Create PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        bufferPages: true
      });

      // Collect PDF data in chunks
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Set document metadata
      doc.info.Title = `Invoice ${invoice.invoiceNumber}`;
      doc.info.Author = invoice.company?.name || 'Company';
      doc.info.Subject = `Invoice for ${invoice.customer?.name}`;
      doc.info.Creator = 'Invoice Management System';

      let currentY = MARGIN;

      // 1. Draw header with company info
      currentY = drawHeader(doc, invoice.company || {});

      // 2. Draw invoice title and metadata
      currentY = drawInvoiceTitle(doc, invoice, currentY);

      // 3. Draw customer details
      currentY = drawCustomerDetails(doc, invoice.customer || {}, currentY);

      // 4. Draw items table
      currentY = drawItemsTable(doc, invoice.items, invoice.currency, currentY);

      // 5. Draw financial summary
      currentY = drawFinancialSummary(doc, invoice, currentY);

      // 6. Add QR code (optional)
      if (options.includeQR !== false) {
        const qrX = MARGIN;
        const qrY = currentY;
        await addQRCode(doc, invoice, qrX, qrY);
        currentY = Math.max(currentY, qrY + 100);
      }

      // 7. Draw notes and payment terms
      currentY = drawNotesAndTerms(doc, invoice, currentY);

      // 8. Draw footer
      drawFooter(doc, invoice.company || {});

      // Finalize PDF
      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateInvoicePDF,
  formatCurrency,
  formatDate
};
