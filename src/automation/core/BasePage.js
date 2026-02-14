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

      // Try progressive fallback strategies if no specific strategy requested
      // For RouteStar: Try load first (JavaScript executes), then fallback to commit
      // For CustomerConnect: commit works fine
      const strategies = options.waitUntil
        ? [options.waitUntil]  // Use specific strategy if requested
        : ['load', 'domcontentloaded', 'commit'];  // Try load first for proper JS execution

      let response = null;
      let successfulStrategy = null;

      for (let i = 0; i < strategies.length; i++) {
        const strategy = strategies[i];
        const isLastAttempt = i === strategies.length - 1;

        try {
          logger.info('Attempting navigation', { strategy, attempt: i + 1, totalStrategies: strategies.length });

          response = await this.page.goto(url, {
            waitUntil: strategy,
            timeout: options.timeout || this.timeouts.navigation
          });

          successfulStrategy = strategy;
          logger.info('Navigation strategy succeeded', { strategy, status: response?.status() });
          break;  // Success! Exit loop
        } catch (error) {
          logger.warn('Navigation strategy failed', {
            strategy,
            attempt: i + 1,
            error: error.message.split('\n')[0]
          });

          // If last strategy, throw error
          if (isLastAttempt) {
            throw error;
          }
          // Otherwise continue to next strategy
        }
      }

      // Wait for page to stabilize
      // If commit strategy was used, wait longer for page to fully load
      if (successfulStrategy === 'commit') {
        logger.info('Commit strategy used - waiting extra time for page to stabilize');
        await wait(10000);  // 10 seconds for commit strategy
      } else {
        await wait(2000);  // 2 seconds for load/domcontentloaded
      }

      const finalUrl = this.page.url();
      if (finalUrl !== url) {
        logger.info('Navigation redirected', {
          originalUrl: url,
          finalUrl: finalUrl
        });
      }

      logger.info('Navigation successful', {
        url: finalUrl,
        status: response?.status(),
        strategy: successfulStrategy
      });

      return true;
    } catch (error) {
      logger.error('Navigation failed', { url, error: error.message });

      // Try to capture screenshot but don't fail if it times out
      try {
        await captureScreenshot(this.page, 'navigation-error');
      } catch (screenshotError) {
        logger.warn('Screenshot also failed', { error: screenshotError.message });
      }

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

      // Use force: true to bypass actionability checks if specified
      // This is useful for elements that exist but may have ongoing animations
      await this.page.click(selector, {
        timeout: options.timeout || this.timeouts.element,
        force: options.force || false
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
  async waitForPageLoad(timeout = 30000) {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout });
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
   * Simple wait/sleep for specified milliseconds
   * @param {number} ms - Milliseconds to wait
   */
  async wait(ms) {
    await wait(ms);
    logger.debug('Waited', { ms });
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
   * Dismiss any modal popups or error dialogs
   */
  async dismissModals() {
    try {
      logger.debug('Checking for modal popups to dismiss');

      // Wait a moment for any modals to appear
      await wait(1000);

      // Try multiple times to catch modals that appear asynchronously
      for (let attempt = 1; attempt <= 3; attempt++) {
        logger.debug('Modal dismissal attempt', { attempt });

        // Common modal/popup selectors
        const modalSelectors = [
          '.jconfirm',  // jConfirm modals
          '.modal.show',  // Bootstrap modals (active)
          '.modal',  // Bootstrap modals (any)
          '.swal2-container',  // SweetAlert2
          '.alert-modal',  // Generic alert modals
          '[role="dialog"]',  // ARIA dialogs
          '.popup-overlay',  // Generic popups
          '.overlay.active'  // Active overlays
        ];

        let foundAny = false;

        for (const selector of modalSelectors) {
          const modals = await this.page.$$(selector);

          for (const modal of modals) {
            // Check if modal is visible
            const isVisible = await modal.isVisible().catch(() => false);
            if (!isVisible) continue;

            foundAny = true;
            logger.info('Found visible modal popup, attempting to dismiss', { selector, attempt });

            // Try clicking various close/cancel buttons
            const closeSelectors = [
              'button:has-text("CANCEL")',  // QuickBooks modal
              'button:has-text("Cancel")',
              'button:has-text("Close")',
              'button:has-text("OK")',
              'button:has-text("Dismiss")',
              '.btn-default',
              '.btn-cancel',
              '.close',
              '[aria-label="Close"]',
              'button.cancel',
              'button[data-dismiss="modal"]'
            ];

            let dismissed = false;
            for (const closeSelector of closeSelectors) {
              try {
                const closeButton = await modal.$(closeSelector);
                if (closeButton) {
                  const buttonVisible = await closeButton.isVisible().catch(() => false);
                  if (buttonVisible) {
                    await closeButton.click({ timeout: 2000 });
                    await wait(1000);  // Wait for modal to close
                    logger.info('Modal dismissed successfully', { closeSelector, attempt });
                    dismissed = true;
                    break;
                  }
                }
              } catch (e) {
                // Try next selector
              }
            }

            // If no button worked, try pressing Escape
            if (!dismissed) {
              logger.info('Trying Escape key to dismiss modal', { attempt });
              await this.page.keyboard.press('Escape');
              await wait(500);
            }
          }
        }

        if (!foundAny) {
          logger.debug('No modal popups found', { attempt });

          // If we didn't find any modals on this attempt and it's not the first attempt, we're done
          if (attempt > 1) {
            break;
          }
        }

        // Wait before next attempt to give modals time to disappear/reappear
        if (attempt < 3) {
          await wait(1000);
        }
      }

      return true;
    } catch (error) {
      logger.warn('Error dismissing modals', { error: error.message });
      return false;
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
