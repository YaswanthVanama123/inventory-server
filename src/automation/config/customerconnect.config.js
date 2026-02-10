/**
 * CustomerConnect Portal Configuration
 */
module.exports = {
  name: 'CustomerConnect',
  baseUrl: process.env.CUSTOMERCONNECT_BASE_URL || 'https://envirostore.mycustomerconnect.com',

  credentials: {
    username: process.env.CUSTOMERCONNECT_USERNAME,
    password: process.env.CUSTOMERCONNECT_PASSWORD
  },

  routes: {
    login: '/index.php?route=account/login',
    account: '/index.php?route=account/account',
    orders: '/index.php?route=account/order',
    orderDetails: '/index.php?route=account/order/info&order_id='
  },

  pagination: {
    itemsPerPage: 10,
    maxRetries: 3,
    pageDelay: 2000
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
