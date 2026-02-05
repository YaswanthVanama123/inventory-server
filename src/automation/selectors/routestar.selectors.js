/**
 * CSS Selectors for RouteStar Portal
 */
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
    invoiceNumber: 'td:nth-child(2) a',
    invoiceLink: 'td:nth-child(2) a',
    invoiceDate: 'td:nth-child(3)',
    enteredBy: 'td:nth-child(4)',
    assignedTo: 'td:nth-child(5)',
    stop: 'td:nth-child(6)',
    customerName: 'td:nth-child(7) a',
    customerLink: 'td:nth-child(7) a',
    invoiceType: 'td:nth-child(8)',
    serviceNotes: 'td:nth-child(9)',
    status: 'td:nth-child(10)',
    complete: 'td:nth-child(11) input[type="checkbox"]',
    posted: 'td:nth-child(12) input[type="checkbox"]',
    invoiceTotal: 'td:nth-child(13)',
    lastModified: 'td:nth-child(14)',
    payment: 'td:nth-child(15)',
    arrivalTime: 'td:nth-child(16)'
  },

  closedInvoicesList: {
    invoicesTable: 'div.ht_master table.htCore',
    invoiceRows: 'table.htCore tbody tr',
    invoiceNumber: 'td:nth-child(2) a',
    invoiceLink: 'td:nth-child(2) a',
    invoiceDate: 'td:nth-child(3)',
    enteredBy: 'td:nth-child(4)',
    assignedTo: 'td:nth-child(5)',
    stop: 'td:nth-child(6)',
    customerName: 'td:nth-child(7) a',
    customerLink: 'td:nth-child(7) a',
    invoiceType: 'td:nth-child(8)',
    serviceNotes: 'td:nth-child(9)',
    status: 'td:nth-child(10)',
    complete: 'td:nth-child(11) input[type="checkbox"]',
    posted: 'td:nth-child(12) input[type="checkbox"]',
    invoiceTotal: 'td:nth-child(13)',
    lastModified: 'td:nth-child(14)',
    payment: 'td:nth-child(15)',
    arrivalTime: 'td:nth-child(16)'
  },

  invoiceDetails: {
    invoiceInfo: '.invoice-header',
    lineItemsTable: '.line-items-table',
    lineItemRows: '.line-items-table tbody tr',
    itemDescription: 'td:nth-child(1)',
    itemQuantity: 'td:nth-child(2)',
    itemPrice: 'td:nth-child(3)',
    itemTotal: 'td:nth-child(4)'
  },

  pagination: {
    nextButton: 'button.next-page',
    prevButton: 'button.prev-page',
    pageInfo: '.page-info'
  }
};
