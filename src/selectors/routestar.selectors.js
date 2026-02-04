/**
 * CSS Selectors for RouteStar
 * Update these selectors based on actual page structure
 */

module.exports = {
  // Login page selectors
  login: {
    usernameInput: 'input[name="username"], input[type="email"], #username, #email',
    passwordInput: 'input[name="password"], input[type="password"], #password',
    submitButton: 'button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")',
    errorMessage: '.error, .alert-danger, [class*="error"]',

    // Cookie consent (if present on site)
    cookieAcceptButton: 'button:has-text("Accept"), button:has-text("I Agree"), button[id*="cookie"], .cookie-accept',

    // Logged-in indicator - element that ONLY appears when logged in
    // Examples: user menu, logout button, dashboard header, user profile
    loggedInIndicator: '.user-menu, .logout-button, [class*="dashboard"], nav.main-nav, .user-profile, a:has-text("Logout")'
  },

  // Navigation selectors
  navigation: {
    invoicesLink: 'a:has-text("Invoices"), a:has-text("Sales"), a[href*="invoices"]',
    dashboardLink: 'a:has-text("Dashboard"), a[href*="dashboard"]'
  },

  // Invoices list page selectors
  invoicesList: {
    invoicesTable: 'table, .invoices-table, [class*="invoices"]',
    invoiceRows: 'tr[data-invoice-id], tbody tr, .invoice-row',
    invoiceNumber: 'td:nth-child(1), .invoice-number, [class*="invoice-number"]',
    invoiceDate: 'td:nth-child(2), .invoice-date, [class*="date"]',
    invoiceStatus: 'td:nth-child(3), .invoice-status, [class*="status"]',
    invoiceTotal: 'td:nth-child(4), .invoice-total, [class*="total"]',
    customerName: 'td:nth-child(5), .customer-name, [class*="customer"]',
    invoiceLink: 'a, button.view-details',
    noResults: '.no-results, .empty-state, :has-text("No invoices")'
  },

  // Invoice detail page selectors
  invoiceDetail: {
    invoiceNumber: 'h1, .invoice-number, [class*="invoice-id"]',
    invoiceDate: '.invoice-date, [class*="invoice-date"]',
    invoiceStatus: '.invoice-status, [class*="status"]',
    customerName: '.customer-name, [class*="customer-name"]',
    customerEmail: '.customer-email, [class*="customer-email"]',
    customerPhone: '.customer-phone, [class*="customer-phone"]',
    customerAddress: '.customer-address, [class*="address"]',
    itemsTable: 'table.items, .items-table, [class*="line-items"]',
    itemRows: 'tr.item-row, tbody tr',
    itemName: 'td:nth-child(1), .item-name, [class*="product-name"]',
    itemSKU: 'td:nth-child(2), .item-sku, [class*="sku"]',
    itemQuantity: 'td:nth-child(3), .item-qty, [class*="quantity"]',
    itemPrice: 'td:nth-child(4), .item-price, [class*="unit-price"]',
    itemTotal: 'td:nth-child(5), .item-total, [class*="line-total"]',
    subtotal: '.subtotal, [class*="subtotal"]',
    tax: '.tax, [class*="tax"]',
    discount: '.discount, [class*="discount"]',
    total: '.total, [class*="grand-total"]'
  },

  // Pagination selectors
  pagination: {
    nextButton: 'a.next, button.next, [class*="next-page"]',
    previousButton: 'a.prev, button.prev, [class*="prev-page"]',
    pageNumbers: '.pagination a, .page-link',
    currentPage: '.pagination .active, .page-link.active'
  }
};
