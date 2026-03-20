

class RouteStarParser {
  static async parseInvoiceRow(row, baseUrl) {
    try {
      const invoiceNumber = await this.extractText(row, 'td:nth-child(2)');
      const invoiceDate = await this.extractText(row, 'td:nth-child(3)');
      const enteredBy = await this.extractText(row, 'td:nth-child(4)');
      const assignedTo = await this.extractText(row, 'td:nth-child(5)');
      const customerName = await this.extractText(row, 'td:nth-child(6)'); // Customer column
      const invoiceType = await this.extractText(row, 'td:nth-child(7)'); // Type column
      const serviceNotes = await this.extractText(row, 'td:nth-child(8)'); // Service Notes column

      const status = await this.extractStatus(row); // Status column (position 9)
      const isComplete = await this.extractCheckbox(row, 'td:nth-child(10)'); // Complete column
      const isPosted = await this.extractCheckbox(row, 'td:nth-child(11)'); // Posted column
      const subtotal = await this.extractText(row, 'td:nth-child(12)'); // Subtotal column
      const total = await this.extractText(row, 'td:nth-child(13)'); // Total column
      const dateCompleted = await this.extractText(row, 'td:nth-child(14)'); // Date Completed column
      const lastModified = await this.extractText(row, 'td:nth-child(15)'); // Last Modified column
      const invoiceLink = await this.extractLink(row, 'td:nth-child(2) a');
      const customerLink = await this.extractLink(row, 'td:nth-child(6) a'); // Customer link is in column 6
      return {
        invoiceNumber,
        invoiceDate,
        enteredBy,
        assignedTo,
        customerName,
        customerLink: customerLink ? new URL(customerLink, baseUrl).href : null,
        invoiceType,
        serviceNotes,
        status,
        isComplete,
        isPosted,
        subtotal: this.parsePrice(subtotal),
        total: this.parsePrice(total),
        dateCompleted,
        lastModified,
        detailUrl: invoiceLink ? new URL(invoiceLink, baseUrl).href : null
      };
    } catch (error) {
      return null;
    }
  }
  static async extractText(row, selector) {
    try {
      return await row.$eval(selector, el => el.textContent.trim());
    } catch (error) {
      return null;
    }
  }
  static async extractLink(row, selector) {
    try {
      return await row.$eval(selector, el => el.getAttribute('href'));
    } catch (error) {
      return null;
    }
  }
  static async extractCheckbox(row, selector) {
    try {
      return await row.$eval(selector + ' input[type="checkbox"]', el => el.checked);
    } catch (error) {
      return false;
    }
  }
  static async extractStatus(row) {
    try {
      const statusData = await row.$eval(
        'td:nth-child(9)', // Status column
        (td) => {
          const className = td.className || '';
          const textContent = td.textContent.trim();
          const result = {
            status: null,
            className,
            textContent
          };
          if (className.includes('htInvalid') || className.includes('status-invalid')) {
            result.status = 'Invalid';
          } else if (className.includes('status-complete') || textContent.toLowerCase().includes('complete')) {
            result.status = 'Complete';
          } else if (className.includes('status-pending') || textContent.toLowerCase().includes('pending')) {
            result.status = 'Pending';
          } else if (textContent) {
            result.status = textContent;
          }
          return result;
        }
      );
      return statusData.status;
    } catch (error) {
      return null;
    }
  }
  static parsePrice(text) {
    if (!text) return '0.00';
    return text.replace(/[$,]/g, '').trim();
  }
  static parseLineItem(data) {
    return {
      description: data.description || '',
      sku: data.sku || '',
      quantity: this.parseNumber(data.quantity),
      unitPrice: this.parseNumber(data.unitPrice),
      total: this.parseNumber(data.total)
    };
  }
  static parseNumber(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  }
}
module.exports = RouteStarParser;
