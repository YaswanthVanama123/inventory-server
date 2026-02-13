const config = require('../config/customerconnect.config');
const selectors = require('../selectors/customerconnect.selectors');

/**
 * Navigator for CustomerConnect Portal
 * Handles all navigation logic
 */
class CustomerConnectNavigator {
  constructor(page) {
    this.page = page;
    this.config = config;
    this.selectors = selectors;
  }

  /**
   * Navigate to orders page
   */
  async navigateToOrders() {
    const ordersUrl = `${this.config.baseUrl}${this.config.routes.orders}`;

    await this.page.goto(ordersUrl, {
      waitUntil: 'load',  // Use load strategy
      timeout: 90000      // 90 second timeout
    });

    // Wait for page to stabilize
    await this.page.waitForTimeout(2000);

    // Debug screenshot
    try {
      const screenshotsDir = require('path').join(__dirname, '../../screenshots');
      require('fs').mkdirSync(screenshotsDir, { recursive: true });
      await this.page.screenshot({
        path: require('path').join(screenshotsDir, `orders-page-${Date.now()}.png`),
        fullPage: true,
        timeout: 15000
      });
    } catch (e) {}

    // Wait for content
    await this.page.waitForSelector('#content', { timeout: 20000 });
  }

  /**
   * Navigate to order details
   */
  async navigateToOrderDetails(orderUrl) {
    await this.page.goto(orderUrl, {
      waitUntil: 'load',  // Use load strategy
      timeout: 90000      // 90 second timeout
    });

    await this.page.waitForTimeout(2000);
  }

  /**
   * Get pagination info
   */
  async getPaginationInfo() {
    try {
      const paginationText = await this.page.textContent(this.selectors.pagination.paginationContainer);

      
      const match = paginationText.match(/of\s+(\d+)\s+\((\d+)\s+Pages?\)/i);

      if (match) {
        return {
          totalOrders: parseInt(match[1]),
          totalPages: parseInt(match[2])
        };
      }

      return { totalOrders: 0, totalPages: 0 };
    } catch (error) {
      return { totalOrders: 0, totalPages: 0 };
    }
  }

  /**
   * Go to next page
   */
  async goToNextPage() {
    const nextButton = await this.page.$(this.selectors.pagination.nextButton);

    if (!nextButton) {
      return false;
    }

    await nextButton.click();

    // Wait for navigation with load strategy
    await this.page.waitForLoadState('load', { timeout: 90000 });
    await this.page.waitForTimeout(2000);

    return true;
  }
}

module.exports = CustomerConnectNavigator;
