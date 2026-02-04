/**
 * CSS Selectors for CustomerConnect EnviroStore
 * Update these selectors based on actual page structure
 */

module.exports = {
  // Login page selectors - UPDATED FROM ACTUAL WEBSITE
  login: {
    // Email input field (they use "email" not "username")
    usernameInput: 'input[name="email"]',

    // Password input field
    passwordInput: 'input[name="password"]',

    // Login button (submit button)
    submitButton: 'input[type="submit"][value="Login"]',

    // Error message container
    errorMessage: '.error, .alert-danger, .warning, [class*="error"]',

    // Cookie consent (if present on site)
    cookieAcceptButton: 'button:has-text("Accept"), button:has-text("I Agree"), button[id*="cookie"], .cookie-accept',

    // Logged-in indicator - after login, the "login" link disappears and "Account" link appears
    // Or look for the welcome message changing from "Welcome visitor" to user name
    loggedInIndicator: 'a:has-text("logout"), a[href*="logout"], #top-links a:has-text("Account"), .welcome:not(:has-text("visitor"))'
  },

  // Navigation selectors - UPDATED FROM ACTUAL WEBSITE
  navigation: {
    // Direct link to order history in the sidebar
    ordersLink: 'a[href*="route=account/order"]',
    dashboardLink: 'a[href*="route=common/home"]'
  },

  // Orders list page selectors - UPDATED FROM ACTUAL WEBSITE
  // Note: This page uses div.order-list containers, NOT a table!
  ordersList: {
    // Container for all orders (the main content div)
    ordersTable: '#content',

    // Each order is a div.order-list
    orderRows: 'div.order-list',

    // Within each order-list div:
    orderNumber: 'div.order-id',  // Contains "Order ID: #75938"
    orderDate: 'div.order-content',  // Contains "Date Added: 02/02/2026" - need to extract
    orderStatus: 'div.order-status',  // Contains "Status: Processing"
    orderTotal: 'div.order-content',  // Contains "Total: $1,513.80" - need to extract

    // Link to order details (the info icon link)
    orderLink: 'a[href*="route=account/order/info"]',

    noResults: '.empty, :has-text("No orders")'
  },

  // Order detail page selectors - UPDATED FROM ACTUAL WEBSITE
  orderDetail: {
    // Order Details section (first table.list)
    orderNumber: 'table.list tbody tr td.left',  // Contains "Order ID: #75938"
    orderDate: 'table.list tbody tr td.left',  // Contains "Date Added: 02/02/2026"
    orderStatus: 'table.list tbody tr td.left',  // Will need to check Order History table

    // These fields are in the first table, first row, first column
    // We'll extract them with regex from the text content

    // Vendor information - NOT available on this page
    // This appears to be shown on the order list page instead
    vendorName: null,
    vendorEmail: null,
    vendorPhone: null,

    // Products table (third table.list)
    itemsTable: 'table.list:nth-of-type(3)',
    itemRows: 'table.list:nth-of-type(3) tbody tr',

    // Columns in product table
    itemName: 'td:nth-child(1)',  // Product Name
    itemSKU: 'td:nth-child(2)',   // Model (SKU)
    itemQuantity: 'td:nth-child(3)',  // Quantity
    itemPrice: 'td:nth-child(4)',  // Price
    itemTotal: 'td:nth-child(5)',  // Total

    // Totals (in tfoot)
    subtotal: 'table.list:nth-of-type(3) tfoot tr:has-text("Sub-Total") td.right:last-child',
    tax: 'table.list:nth-of-type(3) tfoot tr:has-text("Tax") td.right:last-child',
    shipping: 'table.list:nth-of-type(3) tfoot tr:has-text("Shipping") td.right:last-child',
    total: 'table.list:nth-of-type(3) tfoot tr:has-text("Total") td.right:last-child'
  },

  // Pagination selectors - UPDATED FROM ACTUAL WEBSITE
  pagination: {
    // Next page button (the ">" link)
    nextButton: '.pagination .links a:has-text(">")',
    previousButton: '.pagination .links a:has-text("<")',
    pageNumbers: '.pagination .links a',
    currentPage: '.pagination .links b'
  }
};
