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
    await this.page.goto(ordersUrl);
    await this.page.waitForLoadState('networkidle');

    
    try {
      const screenshotsDir = require('path').join(__dirname, '../../screenshots');
      require('fs').mkdirSync(screenshotsDir, { recursive: true });
      await this.page.screenshot({
        path: require('path').join(screenshotsDir, `orders-page-${Date.now()}.png`),
        fullPage: true
      });
    } catch (e) {}

    
    await this.page.waitForSelector('#content', { timeout: 10000 });
  }

  /**
   * Navigate to order details
   */
  async navigateToOrderDetails(orderUrl) {
    await this.page.goto(orderUrl);
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1000);
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
    await this.page.waitForLoadState('networkidle', { timeout: 20000 });
    await this.page.waitForTimeout(2000);
    return true;
  }
}

module.exports = CustomerConnectNavigator;
