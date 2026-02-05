/**
 * CSS Selectors for CustomerConnect Portal
 */
module.exports = {
  login: {
    username: 'input[name="email"]',
    usernameInput: 'input[name="email"]',
    password: 'input[name="password"]',
    passwordInput: 'input[name="password"]',
    submitButton: 'input[type="submit"][value="Login"]',
    errorMessage: '.alert-danger, .warning, .error',
    cookieAcceptButton: 'button:has-text("Accept"), button:has-text("I Agree")',
    loggedInIndicator: 'a:has-text("logout"), a[href*="logout"], .account-logout'
  },

  navigation: {
    ordersLink: 'a[href*="account/orders"]',
    logoutLink: 'a[href*="account/logout"]'
  },

  ordersList: {
    ordersTable: '#content',
    orderRows: '#content .order-list-item, #content > div:has(a[href*="order/info"]), #content > div:has-text("Status:"):has-text("Date Added:")',
    orderNumber: ':scope',
    orderStatus: ':scope',
    orderDate: ':scope',
    orderLink: 'a[href*="order/info"], a[href*="order_id"]',
    noOrders: '.alert-info, :has-text("No orders")'
  },

  orderDetails: {
    orderInfo: 'table.list tbody tr td.left',
    itemsTable: 'table.list',
    itemRows: 'table.list tbody tr',
    itemDescription: 'td:nth-child(1)',
    itemModel: 'td:nth-child(2)',
    itemQuantity: 'td:nth-child(3)',
    itemPrice: 'td:nth-child(4)',
    itemTotal: 'td:nth-child(5)'
  },

  pagination: {
    paginationContainer: '.pagination',
    nextButton: 'a:has-text(">")',
    prevButton: 'a:has-text("<")',
    pageNumbers: '.pagination a',
    currentPage: '.pagination .active'
  }
};
