/**
 * RouteStar Portal Configuration
 */
module.exports = {
  name: 'RouteStar',
  baseUrl: process.env.ROUTESTAR_BASE_URL || 'https://emnrv.routestar.online',

  credentials: {
    username: process.env.ROUTESTAR_USERNAME,
    password: process.env.ROUTESTAR_PASSWORD
  },

  routes: {
    login: '/web/login/',
    invoices: '/web/invoices/',
    closedInvoices: '/web/closedinvoices/',
    invoiceDetails: '/web/invoice/',
    items: '/web/items/'
  },

  pagination: {
    itemsPerPage: 10,
    maxRetries: 3,
    pageDelay: 3000
  },

  timeouts: {
    default: 30000,
    navigation: 20000,
    element: 10000
  },

  retry: {
    maxAttempts: 3,
    delay: 2000,
    backoff: true
  }
};
