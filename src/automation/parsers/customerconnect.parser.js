



class CustomerConnectParser {
  


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

  


  static extractOrderNumber(text) {
    if (!text) return null;
    const match = text.match(/Order ID:\s*#?(\d+)/i);
    return match ? match[1] : null;
  }

  


  static extractStatus(text) {
    if (!text) return null;
    const match = text.match(/Status:\s*(.+)/i);
    return match ? match[1].trim() : null;
  }

  


  static extractDate(text) {
    if (!text) return null;
    const match = text.match(/Date Added:\s*(\d{2}\/\d{2}\/\d{4})/i);
    return match ? match[1] : null;
  }

  


  static extractTotal(text) {
    if (!text) return null;
    const match = text.match(/Total:\s*\$?([\d,]+\.?\d*)/i);
    return match ? match[1] : null;
  }

  


  static extractVendor(text) {
    if (!text) return null;
    const match = text.match(/Vendor\(s\):\s*([^,\n]+)/i);
    return match ? match[1].trim() : null;
  }

  


  static extractPONumber(text) {
    if (!text) return null;
    const match = text.match(/PO Number\(s\):\s*([^,\n]+)/i);
    return match ? match[1].trim() : null;
  }

  


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

  


  static extractPONumberFromDetails(text) {
    if (!text) return null;
    const match = text.match(/PO #:\s*([^\n]+)/i);
    return match ? match[1].trim() : null;
  }

  


  static extractStatusFromDetails(text) {
    if (!text) return null;
    const match = text.match(/Status:\s*([^\n]+)/i);
    return match ? match[1].trim() : null;
  }

  


  static extractVendorFromDetails(text) {
    if (!text) return null;
    const match = text.match(/Vendor:\s*([^\n]+)/i);
    return match ? match[1].trim() : null;
  }

  


  static extractTotalFromDetails(text) {
    if (!text) return null;
    const match = text.match(/Total:\s*\$?([\d,]+\.?\d*)/i);
    return match ? match[1].replace(/,/g, '') : null;
  }

  


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

  


  static extractSKU(text) {
    if (!text) return null;
    
    return text.trim();
  }

  


  static parseNumber(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }

  


  static parsePrice(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
  }

  


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
