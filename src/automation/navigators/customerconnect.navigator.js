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

    console.log('  → Navigating to next page...');

    // Get current page indicator before clicking
    let currentPageText = '';
    try {
      currentPageText = await this.page.textContent('.pagination', { timeout: 5000 });
    } catch (e) {
      // Ignore if can't get current page text
    }

    // Click without waiting for navigation (CustomerConnect uses AJAX)
    await nextButton.click({ noWaitAfter: true, timeout: 10000 });

    // Wait for page content to start updating
    await this.page.waitForTimeout(2000);

    // Wait for new content to be visible
    try {
      await this.page.waitForSelector('#content', {
        state: 'visible',
        timeout: 15000
      });
    } catch (e) {
      console.log('  ⚠️  Content selector timeout - page might not have updated');
    }

    // Wait for any network activity to settle
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      // Network idle timeout is acceptable, page might still be loading background stuff
      console.log('  ⚠️  Network idle timeout - proceeding anyway');
    }

    // Extra wait for table to fully render
    await this.page.waitForTimeout(2000);

    // Verify page actually changed by checking pagination text
    try {
      const newPageText = await this.page.textContent('.pagination', { timeout: 5000 });
      if (currentPageText && newPageText === currentPageText) {
        console.log('  ⚠️  Page may not have changed (pagination text unchanged)');
      }
    } catch (e) {
      // Ignore verification errors
    }

    console.log('  ✓ Page navigation complete');
    return true;
  }
}

module.exports = CustomerConnectNavigator;
