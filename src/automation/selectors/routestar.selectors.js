

module.exports = {
  login: {
    username: '#username',
    usernameInput: '#username',
    password: '#password',
    passwordInput: '#password',
    submitButton: 'button[type="submit"].btn-primary',
    errorMessage: '.alert-danger, .alert-error',
    cookieAcceptButton: 'button:has-text("Accept"), button:has-text("I Agree")',
    loggedInIndicator: 'a:has-text("Logout"), .user-menu, nav.main-nav'
  },
  navigation: {
    invoicesLink: 'a[href*="invoices.php"]',
    closedInvoicesLink: 'a[href*="invoices.php?view=closed"]',
    logoutLink: 'a[href*="logout"]'
  },
  invoicesList: {
    invoicesTable: 'div.ht_master table.htCore',
    invoiceRows: 'table.htCore tbody tr',
    invoiceNumber: 'td:nth-of-type(1) a',
    invoiceLink: 'td:nth-of-type(1) a',
    invoiceDate: 'td:nth-of-type(2)',
    enteredBy: 'td:nth-of-type(3)',
    assignedTo: 'td:nth-of-type(4)',
    stop: 'td:nth-of-type(5)',
    customerName: 'td:nth-of-type(6) a',
    customerLink: 'td:nth-of-type(6) a',
    invoiceType: 'td:nth-of-type(7)',
    serviceNotes: 'td:nth-of-type(8)',
    status: 'td:nth-of-type(9)',
    complete: 'td:nth-of-type(10) input[type="checkbox"]',
    posted: 'td:nth-of-type(11) input[type="checkbox"]',
    invoiceTotal: 'td:nth-of-type(12)',
    lastModified: 'td:nth-of-type(13)',
    payment: 'td:nth-of-type(14)',
    arrivalTime: 'td:nth-of-type(15)'
  },
  closedInvoicesList: {
    invoicesTable: 'div.ht_master table.htCore',
    invoiceRows: 'table.htCore tbody tr',
    invoiceNumber: 'td:nth-of-type(1) a',
    invoiceLink: 'td:nth-of-type(1) a',
    invoiceDate: 'td:nth-of-type(2)',
    enteredBy: 'td:nth-of-type(3)',
    assignedTo: 'td:nth-of-type(4)',
    customerName: 'td:nth-of-type(5) a',       // Column 5: Customer
    customerLink: 'td:nth-of-type(5) a',       // Column 5: Customer link
    invoiceType: 'td:nth-of-type(6)',          // Column 6: Type (Manual Invoice, etc.)
    serviceNotes: 'td:nth-of-type(7)',         // Column 7: Service Notes
    status: 'td:nth-of-type(8)',               // Column 8: Status (Closed, etc.)
    complete: 'td:nth-of-type(9) input[type="checkbox"]',   // Column 9: Complete checkbox
    posted: 'td:nth-of-type(10) input[type="checkbox"]',    // Column 10: Posted checkbox
    subtotal: 'td:nth-of-type(11)',            // Column 11: Subtotal
    invoiceTotal: 'td:nth-of-type(12)',        // Column 12: Total
    dateCompleted: 'td:nth-of-type(13)',       // Column 13: Date Completed
    lastModified: 'td:nth-of-type(14)',        // Column 14: Last Modified
    arrivalTime: 'td:nth-of-type(15)',         // Column 15: Arrival Time
    departureTime: 'td:nth-of-type(16)',       // Column 16: Departure Time
    elapsedTime: 'td:nth-of-type(17)',         // Column 17: Elapsed Time
    customerGrouping: 'td:nth-of-type(18)',    // Column 18: Customer Grouping
    postedBy: 'td:nth-of-type(19)',            // Column 19: Posted By
    postedTimestamp: 'td:nth-of-type(20)',     // Column 20: Posted TimeStamp
    paymentMethod: 'td:nth-of-type(21)',       // Column 21: Payment Method
  },
  invoiceDetail: {
    itemsTable: 'div.ht_master',
    itemName: 'td:nth-of-type(1)',
    itemDescription: 'td:nth-of-type(2)',
    itemQuantity: 'td:nth-of-type(3)',
    itemRate: 'td:nth-of-type(4)',
    itemAmount: 'td:nth-of-type(5)',
    itemClass: 'td:nth-of-type(6)',
    itemWarehouse: 'td:nth-of-type(7)',
    itemTaxCode: 'td:nth-of-type(8)',
    itemLocation: 'td:nth-of-type(9)',
    subtotal: '#inv_subtotal',
    tax: '#inv_taxtotal',
    total: '#inv_total',
    signedBy: '#txt_signedby',
    invoiceMemo: '#txt_memo',
    serviceNotes: '#txt_service_notes',
    salesTaxRate: '#txt_inv_taxrate',
    customerEmail: '#txt_email',
    customerPhone: '#txt_phone'
  },
  pagination: {
    nextButton: '.pagination li.next:not(.disabled)',
    prevButton: '.pagination li.prev:not(.disabled)',
    pageInfo: '#page-selection'
  },
  itemsList: {
    itemsTable: 'div.ht_master table.htCore',
    itemRows: 'table.htCore tbody tr',
    itemParent: 'td:nth-of-type(1)',
    itemName: 'td:nth-of-type(2) a',
    itemNameLink: 'td:nth-of-type(2) a',
    description: 'td:nth-of-type(3)',
    purchaseCost: 'td:nth-of-type(4)',
    salesPrice: 'td:nth-of-type(5)',
    type: 'td:nth-of-type(6)',
    qtyOnOrder: 'td:nth-of-type(7)',
    qtyOnHand: 'td:nth-of-type(8)',
    qtyOnWarehouse: 'td:nth-of-type(9)',
    qtyOnWarehouseLink: 'td:nth-of-type(9) a',
    mfgPartNumber: 'td:nth-of-type(10)',
    uom: 'td:nth-of-type(11)',
    category: 'td:nth-of-type(12)',
    department: 'td:nth-of-type(13)',
    allocated: 'td:nth-of-type(14)',
    grouping: 'td:nth-of-type(15)',
    taxCode: 'td:nth-of-type(16)'
  }
};
