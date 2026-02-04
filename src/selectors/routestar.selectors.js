/**
 * CSS Selectors for RouteStar
 * Update these selectors based on actual page structure
 */

module.exports = {
  // Login page selectors
  login: {
    usernameInput: '#username',
    passwordInput: '#password',
    submitButton: 'button[type="submit"].btn-primary',
    errorMessage: '.alert-danger, .alert-error',

    // Cookie consent (if present on site)
    cookieAcceptButton: 'button:has-text("Accept"), button:has-text("I Agree"), button[id*="cookie"], .cookie-accept',

    // Logged-in indicator - element that ONLY appears when logged in
    // Examples: user menu, logout button, dashboard header, user profile
    loggedInIndicator: '#main:not(:has(#login)), .user-menu, .logout-button, [class*="dashboard"], nav.main-nav, .user-profile, a:has-text("Logout")'
  },

  // Navigation selectors
  navigation: {
    invoicesLink: 'a:has-text("Invoices"), a:has-text("Sales"), a[href*="invoices"]',
    dashboardLink: 'a:has-text("Dashboard"), a[href*="dashboard"]'
  },

  // Invoices list page selectors
  invoicesList: {
    invoicesTable: 'div.ht_master table.htCore',
    invoiceRows: 'div.ht_master table.htCore tbody tr',
    invoiceNumber: 'td:nth-child(2) a',  // First td is actually 2nd child (th is first)
    invoiceDate: 'td:nth-child(3)',
    enteredBy: 'td:nth-child(4)',
    assignedTo: 'td:nth-child(5)',
    stop: 'td:nth-child(6)',
    customerName: 'td:nth-child(7) a',
    invoiceType: 'td:nth-child(8)',
    serviceNotes: 'td:nth-child(9)',
    invoiceStatus: 'td:nth-child(10) span',
    complete: 'td:nth-child(11) input[type="checkbox"]',
    posted: 'td:nth-child(12) input[type="checkbox"]',
    invoiceTotal: 'td:nth-child(13)',
    lastModified: 'td:nth-child(14)',
    payment: 'td:nth-child(15)',
    arrivalTime: 'td:nth-child(16)',
    invoiceLink: 'td:nth-child(2) a',
    noResults: '.no-results, .empty-state'
  },

  // Invoice detail page selectors
  invoiceDetail: {
    // Line items table (Handsontable)
    itemsTableContainer: 'div#example',
    itemsTable: 'div.ht_master table.htCore',
    itemRows: 'div.ht_master table.htCore tbody tr',

    // Line item columns (note: th is first child, so data starts at td:nth-child(2))
    itemName: 'td:nth-child(2)',           // Column 1: Item
    itemDescription: 'td:nth-child(3)',     // Column 2: Description
    itemQuantity: 'td:nth-child(4)',        // Column 3: Qty
    itemRate: 'td:nth-child(5)',            // Column 4: Rate
    itemAmount: 'td:nth-child(6)',          // Column 5: Amount
    itemClass: 'td:nth-child(7)',           // Column 6: Class
    itemWarehouse: 'td:nth-child(8)',       // Column 7: Warehouse
    itemTaxCode: 'td:nth-child(9)',         // Column 8: Tax Code
    itemLocation: 'td:nth-child(10)',       // Column 9: Item Location

    // Totals
    subtotal: 'input#inv_subtotal',
    tax: 'input#inv_taxtotal',
    total: 'input#inv_total',

    // Other fields
    signedBy: 'input#txt_signedby',
    invoiceMemo: 'textarea#txt_memo',
    serviceNotes: 'textarea#txt_service_notes',
    salesTaxRate: 'select#txt_inv_taxrate'
  },

  // Pagination selectors
  pagination: {
    nextButton: 'ul.pagination.bootpag li.next:not(.disabled) a',
    previousButton: 'ul.pagination.bootpag li.prev:not(.disabled) a',
    pageNumbers: 'ul.pagination.bootpag li[data-lp] a',
    currentPage: 'ul.pagination.bootpag li.active a'
  }
};
