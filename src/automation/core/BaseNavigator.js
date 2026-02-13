const BasePage = require('./BasePage');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

/**
 * BaseNavigator - Common navigation patterns
 * Provides reusable navigation flows for all automations
 */
class BaseNavigator extends BasePage {
  constructor(page) {
    super(page);
    this.isLoggedIn = false;
  }

  /**
   * Generic login flow
   * @param {Object} credentials - { username, password }
   * @param {Object} selectors - { usernameInput, passwordInput, submitButton, errorMessage }
   * @param {string} successUrl - URL to check for successful login
   */
  async login(credentials, selectors, successUrl) {
    try {
      logger.info('Attempting login', { username: credentials.username });

      // Wait for login form to be fully interactive
      // This is especially important when using 'commit' navigation strategy
      logger.debug('Waiting for login form to be interactive');
      await this.waitForElement(selectors.usernameInput, { timeout: 30000 });
      await this.wait(2000);  // Extra wait for form to stabilize

      // Type username
      await this.type(selectors.usernameInput, credentials.username);

      // Type password
      await this.type(selectors.passwordInput, credentials.password);

      // Wait for submit button to be fully clickable
      await this.waitForElement(selectors.submitButton, { timeout: 30000 });
      await this.wait(1000);  // Short wait before clicking

      // Click submit with force: true to bypass stability checks
      // Use noWaitAfter to not wait for navigation (we handle it separately)
      // RouteStar has ongoing animations and stuck page loads
      logger.debug('Clicking submit button with force option and no navigation wait');
      await this.page.click(selectors.submitButton, {
        timeout: 30000,
        force: true,
        noWaitAfter: true  // Don't wait for navigation
      });

      // Manually wait for navigation to start
      await this.wait(3000);

      // Wait for navigation to dashboard (but don't fail if it times out)
      try {
        await this.waitForPageLoad();
      } catch (e) {
        logger.warn('Page load wait timed out after login - proceeding anyway');
      }

      // Check for error message
      if (selectors.errorMessage && await this.exists(selectors.errorMessage)) {
        const errorText = await this.getText(selectors.errorMessage);
        throw new Error(`Login failed: ${errorText}`);
      }

      // Verify successful login by checking URL or success element
      if (successUrl) {
        const currentUrl = this.getUrl();
        if (!currentUrl.includes(successUrl)) {
          throw new Error('Login failed: Did not reach expected page');
        }
      }

      this.isLoggedIn = true;
      logger.info('Login successful');
      return true;
    } catch (error) {
      logger.error('Login failed', { error: error.message });
      await this.screenshot('login-failed');
      throw error;
    }
  }

  /**
   * Navigate through pagination
   * @param {Function} extractData - Function to extract data from current page
   * @param {Object} selectors - { nextButton, pagination }
   * @param {Object} options - Pagination options
   */
  async paginate(extractData, selectors, options = {}) {
    const {
      maxPages = Infinity,
      stopOnEmpty = true
    } = options;

    const allData = [];
    let currentPage = 1;

    try {
      while (currentPage <= maxPages) {
        logger.info('Processing page', { page: currentPage });

        // Extract data from current page
        const pageData = await extractData(this.page);

        if (stopOnEmpty && (!pageData || pageData.length === 0)) {
          logger.info('No data on page, stopping pagination', { page: currentPage });
          break;
        }

        allData.push(...pageData);

        // Check if next page exists
        const hasNext = await this.exists(selectors.nextButton);
        if (!hasNext) {
          logger.info('No more pages');
          break;
        }

        // Click next button
        await this.click(selectors.nextButton);
        await this.waitForPageLoad();
        await this.waitForNetwork();

        currentPage++;
      }

      logger.info('Pagination complete', { pages: currentPage - 1, totalItems: allData.length });
      return allData;
    } catch (error) {
      logger.error('Pagination failed', { page: currentPage, error: error.message });
      throw error;
    }
  }

  /**
   * Handle dropdown selection with retry
   * @param {Object} selectors - { dropdown, option }
   * @param {string} value - Value to select
   */
  async selectDropdown(selectors, value) {
    return await retry(
      async () => {
        await this.click(selectors.dropdown);
        await this.wait(500);
        await this.click(selectors.option.replace('VALUE', value));
      },
      { attempts: 3, delay: 1000 }
    );
  }

  /**
   * Apply filters to page
   * @param {Object} filters - Filter values
   * @param {Object} selectors - Filter selectors
   */
  async applyFilters(filters, selectors) {
    try {
      logger.info('Applying filters', { filters });

      for (const [key, value] of Object.entries(filters)) {
        if (!value || !selectors[key]) continue;

        const selector = selectors[key];

        // Handle different input types
        if (selector.type === 'select') {
          await this.select(selector.element, value);
        } else if (selector.type === 'date') {
          await this.type(selector.element, value);
        } else {
          await this.type(selector.element, value);
        }
      }

      // Click apply/search button if provided
      if (selectors.applyButton) {
        await this.click(selectors.applyButton);
        await this.waitForPageLoad();
      }

      logger.info('Filters applied successfully');
      return true;
    } catch (error) {
      logger.error('Failed to apply filters', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if logged in
   */
  checkLoginStatus() {
    return this.isLoggedIn;
  }
}

module.exports = BaseNavigator;
