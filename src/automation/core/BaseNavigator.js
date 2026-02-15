const BasePage = require('./BasePage');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');





class BaseNavigator extends BasePage {
  constructor(page) {
    super(page);
    this.isLoggedIn = false;
  }

  





  async login(credentials, selectors, successUrl) {
    try {
      logger.info('Attempting login', { username: credentials.username });

      
      
      logger.debug('Waiting for login form to be interactive');
      await this.waitForElement(selectors.usernameInput, { timeout: 30000 });
      await this.wait(2000);  

      
      await this.type(selectors.usernameInput, credentials.username);

      
      await this.type(selectors.passwordInput, credentials.password);

      
      await this.waitForElement(selectors.submitButton, { timeout: 30000 });
      await this.wait(1000);  

      
      
      
      logger.debug('Clicking submit button with force option and no navigation wait');
      await this.page.click(selectors.submitButton, {
        timeout: 30000,
        force: true,
        noWaitAfter: true  
      });

      
      await this.wait(3000);

      
      
      try {
        await this.waitForPageLoad(15000); 
      } catch (e) {
        logger.warn('Page load wait timed out after login - proceeding anyway', { error: e.message });
      }

      
      await this.wait(2000);

      
      if (selectors.errorMessage && await this.exists(selectors.errorMessage)) {
        const errorText = await this.getText(selectors.errorMessage);
        throw new Error(`Login failed: ${errorText}`);
      }

      
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

        
        const pageData = await extractData(this.page);

        if (stopOnEmpty && (!pageData || pageData.length === 0)) {
          logger.info('No data on page, stopping pagination', { page: currentPage });
          break;
        }

        allData.push(...pageData);

        
        const hasNext = await this.exists(selectors.nextButton);
        if (!hasNext) {
          logger.info('No more pages');
          break;
        }

        
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

  




  async applyFilters(filters, selectors) {
    try {
      logger.info('Applying filters', { filters });

      for (const [key, value] of Object.entries(filters)) {
        if (!value || !selectors[key]) continue;

        const selector = selectors[key];

        
        if (selector.type === 'select') {
          await this.select(selector.element, value);
        } else if (selector.type === 'date') {
          await this.type(selector.element, value);
        } else {
          await this.type(selector.element, value);
        }
      }

      
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

  


  checkLoginStatus() {
    return this.isLoggedIn;
  }
}

module.exports = BaseNavigator;
