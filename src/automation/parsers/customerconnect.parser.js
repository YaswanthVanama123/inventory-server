/**
 * Data Parser for CustomerConnect
 * Extracts and formats data from portal pages
 */
class CustomerConnectParser {
  /**
   * Parse order from order list row
   */
  static parseOrderListItem(orderDiv, extractText) {
    return {
      orderNumber: this.extractOrderNumber(extractText(orderDiv, 'div.order-id')),
      status: this.extractStatus(extractText(orderDiv, 'div.order-status')),
      orderDate: this.extractDate(extractText(orderDiv, 'div.order-content')),
      total: this.extractTotal(extractText(orderDiv, 'div.order-content')),
      vendorName: this.extractVendor(extractText(orderDiv, 'div.order-content')),
      poNumber: this.extractPONumber(extractText(orderDiv, 'div.order-content'))
    };
  }

  /**
   * Extract order number from text
   */
  static extractOrderNumber(text) {
    if (!text) return null;
    const match = text.match(/Order ID:\s*#?(\d+)/i);
    return match ? match[1] : null;
  }

  /**
   * Extract status from text
   */
  static extractStatus(text) {
    if (!text) return null;
    const match = text.match(/Status:\s*(.+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract date from text
   */
  static extractDate(text) {
    if (!text) return null;
    const match = text.match(/Date Added:\s*(\d{2}\/\d{2}\/\d{4})/i);
    return match ? match[1] : null;
  }

  /**
   * Extract total from text
   */
  static extractTotal(text) {
    if (!text) return null;
    const match = text.match(/Total:\s*\$?([\d,]+\.?\d*)/i);
    return match ? match[1] : null;
  }

  /**
   * Extract vendor from text
   */
  static extractVendor(text) {
    if (!text) return null;
    const match = text.match(/Vendor\(s\):\s*([^,\n]+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract PO number from text
   */
  static extractPONumber(text) {
    if (!text) return null;
    const match = text.match(/PO Number\(s\):\s*([^,\n]+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Parse order details from detail page
   */
  static parseOrderDetails(detailsText) {
    return {
      orderNumber: this.extractOrderNumber(detailsText),
      poNumber: this.extractPONumberFromDetails(detailsText),
      orderDate: this.extractDate(detailsText),
      status: this.extractStatusFromDetails(detailsText),
      vendor: this.extractVendorFromDetails(detailsText),
      total: this.extractTotalFromDetails(detailsText)
    };
  }

  /**
   * Extract PO number from details
   */
  static extractPONumberFromDetails(text) {
    if (!text) return null;
    const match = text.match(/PO #:\s*([^\n]+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract status from details
   */
  static extractStatusFromDetails(text) {
    if (!text) return null;
    const match = text.match(/Status:\s*([^\n]+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract vendor from details
   */
  static extractVendorFromDetails(text) {
    if (!text) return null;
    const match = text.match(/Vendor:\s*([^\n]+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract total from details
   */
  static extractTotalFromDetails(text) {
    if (!text) return null;
    const match = text.match(/Total:\s*\$?([\d,]+\.?\d*)/i);
    return match ? match[1].replace(/,/g, '') : null;
  }

  /**
   * Parse line item from table row
   */
  static parseLineItem(row, extractText) {
    return {
      description: extractText(row, 'td:nth-child(1)')?.trim() || '',
      model: extractText(row, 'td:nth-child(2)')?.trim() || '',
      sku: this.extractSKU(extractText(row, 'td:nth-child(2)')),
      quantity: this.parseNumber(extractText(row, 'td:nth-child(3)')),
      unitPrice: this.parsePrice(extractText(row, 'td:nth-child(4)')),
      total: this.parsePrice(extractText(row, 'td:nth-child(5)'))
    };
  }

  /**
   * Extract SKU from model text
   */
  static extractSKU(text) {
    if (!text) return null;
    
    return text.trim();
  }

  /**
   * Parse number from text
   */
  static parseNumber(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * Parse price from text
   */
  static parsePrice(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * Get pagination info
   */
  static parsePaginationInfo(paginationText) {
    
    const match = paginationText.match(/of\s+(\d+)\s+\((\d+)\s+Pages?\)/i);

    if (match) {
      return {
        totalOrders: parseInt(match[1]),
        totalPages: parseInt(match[2])
      };
    }

    return {
      totalOrders: 0,
      totalPages: 0
    };
  }
}

module.exports = CustomerConnectParser;
