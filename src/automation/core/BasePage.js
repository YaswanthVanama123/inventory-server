const logger = require('../utils/logger');
const { wait, waitForNetworkIdle } = require('../utils/wait');
const { captureScreenshot } = require('../utils/screenshot');
const timeoutConfig = require('../config/timeout.config');





class BasePage {
  constructor(page) {
    this.page = page;
    this.timeouts = timeoutConfig;
  }

  




  async navigateTo(url, options = {}) {
    try {
      logger.info('Navigating to URL', { url });

      
      
      
      const strategies = options.waitUntil
        ? [options.waitUntil]  
        : ['load', 'domcontentloaded', 'commit'];  

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
          break;  
        } catch (error) {
          logger.warn('Navigation strategy failed', {
            strategy,
            attempt: i + 1,
            error: error.message.split('\n')[0]
          });

          
          if (isLastAttempt) {
            throw error;
          }
          
        }
      }

      
      
      if (successfulStrategy === 'commit') {
        logger.info('Commit strategy used - waiting extra time for page to stabilize');
        await wait(10000);  
      } else {
        await wait(2000);  
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

      
      try {
        await captureScreenshot(this.page, 'navigation-error');
      } catch (screenshotError) {
        logger.warn('Screenshot also failed', { error: screenshotError.message });
      }

      throw error;
    }
  }

  




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

  




  async click(selector, options = {}) {
    try {
      logger.debug('Clicking element', { selector });

      await this.waitForElement(selector, options);

      
      
      await this.page.click(selector, {
        timeout: options.timeout || this.timeouts.element,
        force: options.force || false
      });

      
      await wait(options.delay || 500);

      logger.debug('Clicked successfully', { selector });
      return true;
    } catch (error) {
      logger.error('Click failed', { selector, error: error.message });
      await captureScreenshot(this.page, `click-error-${selector.replace(/[^a-z0-9]/gi, '-')}`);
      throw error;
    }
  }

  





  async type(selector, text, options = {}) {
    try {
      logger.debug('Typing into element', { selector, textLength: text.length });

      await this.waitForElement(selector, options);

      
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

  



  async exists(selector) {
    try {
      const element = await this.page.$(selector);
      return element !== null;
    } catch (error) {
      return false;
    }
  }

  


  async waitForPageLoad(timeout = 30000) {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout });
      await wait(1000); 
      logger.debug('Page loaded');
      return true;
    } catch (error) {
      logger.error('Page load wait failed', { error: error.message });
      return false;
    }
  }

  


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

  



  async wait(ms) {
    await wait(ms);
    logger.debug('Waited', { ms });
  }

  



  async scrollToElement(selector) {
    try {
      await this.page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, selector);

      await wait(500); 
      logger.debug('Scrolled to element', { selector });
      return true;
    } catch (error) {
      logger.error('Scroll failed', { selector, error: error.message });
      return false;
    }
  }

  



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

  




  async evaluate(pageFunction, ...args) {
    try {
      return await this.page.evaluate(pageFunction, ...args);
    } catch (error) {
      logger.error('Evaluate failed', { error: error.message });
      throw error;
    }
  }

  


  async dismissModals() {
    try {
      logger.debug('Checking for modal popups to dismiss');

      
      await wait(1000);

      
      for (let attempt = 1; attempt <= 3; attempt++) {
        logger.debug('Modal dismissal attempt', { attempt });

        
        const modalSelectors = [
          '.jconfirm',  
          '.modal.show',  
          '.modal',  
          '.swal2-container',  
          '.alert-modal',  
          '[role="dialog"]',  
          '.popup-overlay',  
          '.overlay.active'  
        ];

        let foundAny = false;

        for (const selector of modalSelectors) {
          const modals = await this.page.$$(selector);

          for (const modal of modals) {
            
            const isVisible = await modal.isVisible().catch(() => false);
            if (!isVisible) continue;

            foundAny = true;
            logger.info('Found visible modal popup, attempting to dismiss', { selector, attempt });

            
            const closeSelectors = [
              'button:has-text("CANCEL")',  
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
                    await wait(1000);  
                    logger.info('Modal dismissed successfully', { closeSelector, attempt });
                    dismissed = true;
                    break;
                  }
                }
              } catch (e) {
                
              }
            }

            
            if (!dismissed) {
              logger.info('Trying Escape key to dismiss modal', { attempt });
              await this.page.keyboard.press('Escape');
              await wait(500);
            }
          }
        }

        if (!foundAny) {
          logger.debug('No modal popups found', { attempt });

          
          if (attempt > 1) {
            break;
          }
        }

        
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

  



  async screenshot(name) {
    return await captureScreenshot(this.page, name);
  }

  


  getUrl() {
    return this.page.url();
  }

  


  async getTitle() {
    return await this.page.title();
  }

  


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
