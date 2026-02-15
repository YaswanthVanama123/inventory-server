const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');





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

  


  async init() {
    if (this.isInitialized) {
      console.log('⚠️  Automation already initialized');
      return;
    }

    try {
      
      const browserTimeout = parseInt(process.env.BROWSER_TIMEOUT) || 60000;
      console.log(`Browser timeout set to: ${browserTimeout}ms`);

      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: browserTimeout
      });


      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      });


      this.page = await this.context.newPage();

      
      this.page.setDefaultTimeout(browserTimeout);

      this.isInitialized = true;
      console.log('✓ Browser automation initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize automation: ${error.message}`);
    }
  }

  


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

    const browserTimeout = parseInt(process.env.BROWSER_TIMEOUT) || 60000;
    const loginTimeout = browserTimeout * 1.5; 

    try {

      const loginUrl = this.config.baseUrl + this.config.routes.login;

      console.log('Navigating to login page...');
      console.log(`URL: ${loginUrl}`);
      await this.page.goto(loginUrl, {
        waitUntil: 'load',
        timeout: loginTimeout
      });
      await this.page.waitForTimeout(2000);


      try {
        const cookieButton = await this.page.$(this.selectors.login.cookieAcceptButton);
        if (cookieButton) {
          console.log('Accepting cookies...');
          await cookieButton.click();
          await this.page.waitForTimeout(1000);
        }
      } catch (error) {
        console.log('No cookie banner found or already accepted');
      }


      console.log('Waiting for login form...');
      const usernameSelector = this.selectors.login.usernameInput || this.selectors.login.username;
      const passwordSelector = this.selectors.login.passwordInput || this.selectors.login.password;

      await this.page.waitForSelector(usernameSelector, {
        timeout: 20000,
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
      const submitButton = await this.page.$(this.selectors.login.submitButton);
      if (!submitButton) {
        await this.takeScreenshot('login-button-not-found');
        throw new Error(`Login button not found with selector: ${this.selectors.login.submitButton}`);
      }
      console.log('Submit button found, clicking...');
      await submitButton.click();

      console.log('Waiting for navigation after login...');

      
      await this.page.waitForTimeout(3000);

      
      const currentUrl = this.page.url();
      console.log(`Current URL after 3 seconds: ${currentUrl}`);

      
      try {
        const errorElement = await this.page.$(this.selectors.login.errorMessage);
        if (errorElement) {
          const errorText = await errorElement.textContent();
          console.log(`⚠️  Error message found: ${errorText}`);
          await this.takeScreenshot('login-error-message');
          throw new Error(`Login error: ${errorText}`);
        }
      } catch (error) {
        if (error.message.includes('Login error:')) {
          throw error;
        }
        
      }

      
      if (currentUrl.includes('/web/login')) {
        console.log('❌ Still on login page after submit');
        await this.takeScreenshot('still-on-login-after-submit');

        
        const title = await this.page.title();
        console.log(`Page title: ${title}`);

        throw new Error('Login failed: Still on login page after clicking submit. Check credentials or login page structure.');
      }

      console.log('✓ Successfully navigated away from login page');

      
      console.log('Waiting 2 seconds for page stabilization...');
      await this.page.waitForTimeout(2000);


      try {
        const hasError = await this.page.$(this.selectors.login.errorMessage);
        if (hasError) {
          const errorText = await this.page.textContent(this.selectors.login.errorMessage);
          throw new Error(`Login failed: ${errorText}`);
        }
      } catch (error) {
        
        if (error.message.includes('Login failed:')) {
          throw error;
        }
      }


      console.log('Verifying login success...');
      await this.verifyLoginSuccess();

      this.isLoggedIn = true;
      console.log('✓ Successfully logged in');
    } catch (error) {
      console.error('❌ Login error:', error.message);
      const screenshotPath = await this.takeScreenshot('login-error');
      if (screenshotPath) {
        console.log(`Screenshot saved: ${screenshotPath}`);
      }
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  


  async verifyLoginSuccess() {
    
    throw new Error('verifyLoginSuccess must be implemented by child class');
  }

  


  async navigateTo(url, waitForSelector = null) {
    const browserTimeout = parseInt(process.env.BROWSER_TIMEOUT) || 60000;

    try {
      console.log(`Navigating to: ${url}`);
      await this.page.goto(url, {
        waitUntil: 'load',
        timeout: browserTimeout
      });

      try {
        await this.page.waitForLoadState('networkidle', { timeout: 15000 });
      } catch (error) {
        console.log('Network idle timeout during navigation, continuing...');
      }

      if (waitForSelector) {
        await this.page.waitForSelector(waitForSelector, { timeout: 15000 });
      }

      console.log('✓ Navigation successful');
    } catch (error) {
      throw new Error(`Navigation failed: ${error.message}`);
    }
  }

  


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

  


  async extractText(element, selector, defaultValue = null) {
    try {
      return await element.$eval(selector, el => el.textContent.trim());
    } catch (error) {
      return defaultValue;
    }
  }

  


  async extractAttribute(element, selector, attribute, defaultValue = null) {
    try {
      return await element.$eval(selector, (el, attr) => el.getAttribute(attr), attribute);
    } catch (error) {
      return defaultValue;
    }
  }

  


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
        console.log(`Moving to page ${pageCount + 2}...`);
        await nextButton.click();

        try {
          await this.page.waitForLoadState('networkidle', { timeout: 30000 });
        } catch (error) {
          console.log('Network idle timeout during pagination, continuing...');
          await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        }

        await this.page.waitForTimeout(pageDelay);
        pageCount++;
      } else {
        hasNextPage = false;
        console.log('No more pages to load');
      }
    }

    return results;
  }

  


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

  


  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('Automation not initialized. Call init() first.');
    }
  }
}

module.exports = BaseAutomation;
