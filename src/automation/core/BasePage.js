const logger = require('../utils/logger');
const { wait, waitForNetworkIdle } = require('../utils/wait');
const { captureScreenshot } = require('../utils/screenshot');
const timeoutConfig = require('../config/timeout.config');

/**
 * BasePage - Common page interactions and wait strategies
 * Provides reusable page interaction methods
 */
class BasePage {
  constructor(page) {
    this.page = page;
    this.timeouts = timeoutConfig;
  }

  /**
   * Navigate to URL with validation
   * @param {string} url - Target URL
   * @param {Object} options - Navigation options
   */
  async navigateTo(url, options = {}) {
    try {
      logger.info('Navigating to URL', { url });

      await this.page.goto(url, {
        waitUntil: options.waitUntil || 'domcontentloaded',
        timeout: options.timeout || this.timeouts.navigation
      });

      logger.info('Navigation successful', { url });
      return true;
    } catch (error) {
      logger.error('Navigation failed', { url, error: error.message });
      await captureScreenshot(this.page, 'navigation-error');
      throw error;
    }
  }

  /**
   * Wait for element to be visible
   * @param {string} selector - CSS selector
   * @param {Object} options - Wait options
   */
  async waitForElement(selector, options = {}) {
    try {
      await this.page.waitForSelector(selector, {
        state: 'visible',
        timeout: options.timeout || this.timeouts.element
      });

      logger.debug('Element found', { selector });
      return true;
    } catch (error) {
      logger.warn('Element not found', { selector, error: error.message });
      await captureScreenshot(this.page, `element-not-found-${selector.replace(/[^a-z0-9]/gi, '-')}`);
      return false;
    }
  }

  /**
   * Click element with retry
   * @param {string} selector - CSS selector
   * @param {Object} options - Click options
   */
  async click(selector, options = {}) {
    try {
      logger.debug('Clicking element', { selector });

      await this.waitForElement(selector, options);
      await this.page.click(selector, {
        timeout: options.timeout || this.timeouts.element
      });

      // Wait a bit after click for any page transitions
      await wait(options.delay || 500);

      logger.debug('Clicked successfully', { selector });
      return true;
    } catch (error) {
      logger.error('Click failed', { selector, error: error.message });
      await captureScreenshot(this.page, `click-error-${selector.replace(/[^a-z0-9]/gi, '-')}`);
      throw error;
    }
  }

  /**
   * Type text into input field
   * @param {string} selector - CSS selector
   * @param {string} text - Text to type
   * @param {Object} options - Type options
   */
  async type(selector, text, options = {}) {
    try {
      logger.debug('Typing into element', { selector, textLength: text.length });

      await this.waitForElement(selector, options);

      // Clear existing text first if specified
      if (options.clear !== false) {
        await this.page.fill(selector, '');
      }

      await this.page.type(selector, text, {
        delay: options.delay || 50
      });

      logger.debug('Typed successfully', { selector });
      return true;
    } catch (error) {
      logger.error('Type failed', { selector, error: error.message });
      await captureScreenshot(this.page, `type-error-${selector.replace(/[^a-z0-9]/gi, '-')}`);
      throw error;
    }
  }

  /**
   * Select option from dropdown
   * @param {string} selector - CSS selector
   * @param {string|Object} value - Value to select
   */
  async select(selector, value, options = {}) {
    try {
      logger.debug('Selecting option', { selector, value });

      await this.waitForElement(selector, options);

      if (typeof value === 'string') {
        await this.page.selectOption(selector, value);
      } else {
        await this.page.selectOption(selector, value);
      }

      logger.debug('Selected successfully', { selector, value });
      return true;
    } catch (error) {
      logger.error('Select failed', { selector, error: error.message });
      await captureScreenshot(this.page, `select-error-${selector.replace(/[^a-z0-9]/gi, '-')}`);
      throw error;
    }
  }

  /**
   * Get text content of element
   * @param {string} selector - CSS selector
   */
  async getText(selector, options = {}) {
    try {
      await this.waitForElement(selector, options);

      const text = await this.page.textContent(selector);
      logger.debug('Text retrieved', { selector, textLength: text?.length });

      return text ? text.trim() : '';
    } catch (error) {
      logger.error('Get text failed', { selector, error: error.message });
      return null;
    }
  }

  /**
   * Get attribute value
   * @param {string} selector - CSS selector
   * @param {string} attribute - Attribute name
   */
  async getAttribute(selector, attribute, options = {}) {
    try {
      await this.waitForElement(selector, options);

      const value = await this.page.getAttribute(selector, attribute);
      logger.debug('Attribute retrieved', { selector, attribute, value });

      return value;
    } catch (error) {
      logger.error('Get attribute failed', { selector, attribute, error: error.message });
      return null;
    }
  }

  /**
   * Check if element exists
   * @param {string} selector - CSS selector
   */
  async exists(selector) {
    try {
      const element = await this.page.$(selector);
      return element !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for page to be loaded
   */
  async waitForPageLoad() {
    try {
      await this.page.waitForLoadState('domcontentloaded');
      await wait(1000); // Additional wait for dynamic content
      logger.debug('Page loaded');
      return true;
    } catch (error) {
      logger.error('Page load wait failed', { error: error.message });
      return false;
    }
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetwork() {
    try {
      await waitForNetworkIdle(this.page, this.timeouts.network);
      logger.debug('Network idle');
      return true;
    } catch (error) {
      logger.error('Network idle wait failed', { error: error.message });
      return false;
    }
  }

  /**
   * Scroll to element
   * @param {string} selector - CSS selector
   */
  async scrollToElement(selector) {
    try {
      await this.page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, selector);

      await wait(500); // Wait for scroll animation
      logger.debug('Scrolled to element', { selector });
      return true;
    } catch (error) {
      logger.error('Scroll failed', { selector, error: error.message });
      return false;
    }
  }

  /**
   * Get all elements matching selector
   * @param {string} selector - CSS selector
   */
  async getElements(selector) {
    try {
      const elements = await this.page.$$(selector);
      logger.debug('Elements retrieved', { selector, count: elements.length });
      return elements;
    } catch (error) {
      logger.error('Get elements failed', { selector, error: error.message });
      return [];
    }
  }

  /**
   * Evaluate JavaScript in page context
   * @param {Function} pageFunction - Function to evaluate
   * @param {*} args - Arguments to pass
   */
  async evaluate(pageFunction, ...args) {
    try {
      return await this.page.evaluate(pageFunction, ...args);
    } catch (error) {
      logger.error('Evaluate failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Take screenshot
   * @param {string} name - Screenshot name
   */
  async screenshot(name) {
    return await captureScreenshot(this.page, name);
  }

  /**
   * Get page URL
   */
  getUrl() {
    return this.page.url();
  }

  /**
   * Get page title
   */
  async getTitle() {
    return await this.page.title();
  }

  /**
   * Reload page
   */
  async reload(options = {}) {
    try {
      await this.page.reload({
        waitUntil: options.waitUntil || 'domcontentloaded',
        timeout: options.timeout || this.timeouts.navigation
      });

      logger.debug('Page reloaded');
      return true;
    } catch (error) {
      logger.error('Reload failed', { error: error.message });
      return false;
    }
  }
}

module.exports = BasePage;
