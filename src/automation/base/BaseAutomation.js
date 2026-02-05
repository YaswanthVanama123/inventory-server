const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * Base Automation Class
 * Provides common functionality for all automation classes
 */
class BaseAutomation {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isInitialized = false;
    this.isLoggedIn = false;
    this.selectors = null; 
  }

  /**
   * Initialize browser and create page
   */
  async init() {
    if (this.isInitialized) {
      console.log('⚠️  Automation already initialized');
      return;
    }

    try {
      
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      });

      
      this.page = await this.context.newPage();

      
      this.page.setDefaultTimeout(30000);

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize automation: ${error.message}`);
    }
  }

  /**
   * Login to the portal
   */
  async login() {
    
    if (!this.config.baseUrl || !this.config.routes || !this.config.credentials) {
      throw new Error('Login configuration missing');
    }

    if (!this.config.credentials.username || !this.config.credentials.password) {
      throw new Error('Login credentials missing');
    }

    if (!this.selectors || !this.selectors.login) {
      throw new Error('Login selectors not configured');
    }

    try {
      
      const loginUrl = this.config.baseUrl + this.config.routes.login;

      console.log('Navigating to login page...');
      await this.page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(2000);

      
      try {
        const cookieButton = await this.page.$(this.selectors.login.cookieAcceptButton);
        if (cookieButton) {
          console.log('Accepting cookies...');
          await cookieButton.click();
          await this.page.waitForTimeout(1000);
        }
      } catch (error) {
        
      }

      
      console.log('Waiting for login form...');
      const usernameSelector = this.selectors.login.usernameInput || this.selectors.login.username;
      const passwordSelector = this.selectors.login.passwordInput || this.selectors.login.password;

      await this.page.waitForSelector(usernameSelector, {
        timeout: 15000,
        state: 'visible'
      });

      
      console.log('Filling username...');
      await this.page.fill(usernameSelector, '');
      await this.page.waitForTimeout(500);
      await this.page.fill(usernameSelector, this.config.credentials.username);

      console.log('Filling password...');
      await this.page.fill(passwordSelector, '');
      await this.page.waitForTimeout(500);
      await this.page.fill(passwordSelector, this.config.credentials.password);

      
      console.log('Clicking login button...');
      await this.page.click(this.selectors.login.submitButton);
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });
      await this.page.waitForTimeout(2000);

      
      const hasError = await this.page.$(this.selectors.login.errorMessage);
      if (hasError) {
        const errorText = await this.page.textContent(this.selectors.login.errorMessage);
        throw new Error(`Login failed: ${errorText}`);
      }

      
      await this.verifyLoginSuccess();

      this.isLoggedIn = true;
      console.log('✓ Successfully logged in');
    } catch (error) {
      await this.takeScreenshot('login-error');
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Verify login was successful
   */
  async verifyLoginSuccess() {
    
    throw new Error('verifyLoginSuccess must be implemented by child class');
  }

  /**
   * Navigate to a specific URL
   */
  async navigateTo(url, waitForSelector = null) {
    try {
      await this.page.goto(url);
      await this.page.waitForLoadState('networkidle');

      if (waitForSelector) {
        await this.page.waitForSelector(waitForSelector, { timeout: 10000 });
      }
    } catch (error) {
      throw new Error(`Navigation failed: ${error.message}`);
    }
  }

  /**
   * Wait for element with retry logic
   */
  async waitForElement(selector, options = {}) {
    const { timeout = 10000, retries = 3 } = options;

    for (let i = 0; i < retries; i++) {
      try {
        await this.page.waitForSelector(selector, { timeout });
        return true;
      } catch (error) {
        if (i === retries - 1) {
          throw new Error(`Element not found after ${retries} retries: ${selector}`);
        }
        await this.page.waitForTimeout(1000);
      }
    }
  }

  /**
   * Extract text content safely
   */
  async extractText(element, selector, defaultValue = null) {
    try {
      return await element.$eval(selector, el => el.textContent.trim());
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Extract attribute safely
   */
  async extractAttribute(element, selector, attribute, defaultValue = null) {
    try {
      return await element.$eval(selector, (el, attr) => el.getAttribute(attr), attribute);
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Click element with retry
   */
  async clickWithRetry(selector, options = {}) {
    const { retries = 3, delay = 1000 } = options;

    for (let i = 0; i < retries; i++) {
      try {
        await this.page.click(selector);
        return true;
      } catch (error) {
        if (i === retries - 1) {
          throw new Error(`Click failed after ${retries} retries: ${selector}`);
        }
        await this.page.waitForTimeout(delay);
      }
    }
  }

  /**
   * Handle pagination
   */
  async handlePagination(callback, options = {}) {
    const {
      nextButtonSelector,
      maxPages = Infinity,
      pageDelay = 2000
    } = options;

    let pageCount = 0;
    let hasNextPage = true;
    const results = [];

    while (hasNextPage && pageCount < maxPages) {
      
      const pageResults = await callback(pageCount);
      results.push(...pageResults);

      
      const nextButton = await this.page.$(nextButtonSelector);
      if (nextButton) {
        await nextButton.click();
        await this.page.waitForLoadState('networkidle', { timeout: 20000 });
        await this.page.waitForTimeout(pageDelay);
        pageCount++;
      } else {
        hasNextPage = false;
      }
    }

    return results;
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(name) {
    try {
      const screenshotsDir = path.join(__dirname, '../../screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      const filename = `${name}-${Date.now()}.png`;
      const filepath = path.join(screenshotsDir, filename);

      await this.page.screenshot({ path: filepath, fullPage: true });
      return filepath;
    } catch (error) {
      console.error('Screenshot failed:', error.message);
      return null;
    }
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(fn, options = {}) {
    const { retries = 3, delay = 2000, onRetry = null } = options;

    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }

        if (onRetry) {
          await onRetry(i + 1, error);
        }

        await this.page.waitForTimeout(delay);
      }
    }
  }

  /**
   * Close browser and cleanup
   */
  async close() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.isInitialized = false;
    } catch (error) {
      console.error('Error closing automation:', error.message);
    }
  }

  /**
   * Check if automation is initialized
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('Automation not initialized. Call init() first.');
    }
  }
}

module.exports = BaseAutomation;
