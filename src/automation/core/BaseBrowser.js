const { chromium, firefox, webkit } = require('playwright');
const logger = require('../utils/logger');
const browserConfig = require('../config/browser.config');





class BaseBrowser {
  constructor(options = {}) {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.options = { ...browserConfig, ...options };
  }

  



  async launch(browserType = 'chromium') {
    try {
      logger.info('Launching browser', { browserType, headless: this.options.headless });

      const browsers = { chromium, firefox, webkit };
      const browserEngine = browsers[browserType] || chromium;

      this.browser = await browserEngine.launch({
        headless: this.options.headless,
        slowMo: this.options.slowMo,
        ...this.options.launchOptions
      });

      logger.info('Browser launched successfully');
      return this.browser;
    } catch (error) {
      logger.error('Failed to launch browser', { error: error.message });
      throw error;
    }
  }

  



  async createContext(contextOptions = {}) {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    try {
      this.context = await this.browser.newContext({
        viewport: this.options.viewport,
        userAgent: this.options.userAgent || undefined,
        ...contextOptions
      });

      logger.info('Browser context created');
      return this.context;
    } catch (error) {
      logger.error('Failed to create context', { error: error.message });
      throw error;
    }
  }

  


  async createPage() {
    if (!this.context) {
      await this.createContext();
    }

    try {
      this.page = await this.context.newPage();

      
      this.page.setDefaultTimeout(this.options.timeout);

      
      await this.page.addInitScript(() => {
        
        try {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => false
          });
        } catch (e) {
          
        }

        
        try {
          if (!window.chrome || !window.chrome.runtime) {
            Object.defineProperty(window, 'chrome', {
              writable: true,
              enumerable: true,
              configurable: false,
              value: {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
              }
            });
          }
        } catch (e) {
          
        }

        
        try {
          const originalQuery = window.navigator.permissions.query;
          window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
              Promise.resolve({ state: Notification.permission }) :
              originalQuery(parameters)
          );
        } catch (e) {
          
        }

        
        try {
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
          });
        } catch (e) {
          
        }

        
        try {
          Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
          });
        } catch (e) {
          
        }
      });

      logger.info('New page created');
      return this.page;
    } catch (error) {
      logger.error('Failed to create page', { error: error.message });
      throw error;
    }
  }

  


  async saveCookies() {
    if (!this.context) {
      throw new Error('No context available');
    }

    try {
      const cookies = await this.context.cookies();
      logger.debug('Cookies saved', { count: cookies.length });
      return cookies;
    } catch (error) {
      logger.error('Failed to save cookies', { error: error.message });
      throw error;
    }
  }

  



  async loadCookies(cookies) {
    if (!this.context) {
      throw new Error('No context available');
    }

    try {
      await this.context.addCookies(cookies);
      logger.debug('Cookies loaded', { count: cookies.length });
    } catch (error) {
      logger.error('Failed to load cookies', { error: error.message });
      throw error;
    }
  }

  


  async clearCookies() {
    if (!this.context) {
      return;
    }

    try {
      await this.context.clearCookies();
      logger.debug('Cookies cleared');
    } catch (error) {
      logger.error('Failed to clear cookies', { error: error.message });
    }
  }

  


  async close() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
        logger.debug('Page closed');
      }

      if (this.context) {
        await this.context.close();
        this.context = null;
        logger.debug('Context closed');
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        logger.info('Browser closed');
      }
    } catch (error) {
      logger.error('Error during cleanup', { error: error.message });
    }
  }

  


  isRunning() {
    return this.browser !== null && this.browser.isConnected();
  }

  


  getCurrentPage() {
    return this.page;
  }

  


  getContext() {
    return this.context;
  }
}

module.exports = BaseBrowser;
