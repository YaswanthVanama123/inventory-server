const config = require('../config/customerconnect.config');
const selectors = require('../selectors/customerconnect.selectors');





class CustomerConnectNavigator {
  constructor(page) {
    this.page = page;
    this.config = config;
    this.selectors = selectors;
  }

  


  async navigateToOrders() {
    const ordersUrl = `${this.config.baseUrl}${this.config.routes.orders}`;

    await this.page.goto(ordersUrl, {
      waitUntil: 'load',  
      timeout: 90000      
    });

    
    await this.page.waitForTimeout(2000);

    
    try {
      const screenshotsDir = require('path').join(__dirname, '../../screenshots');
      require('fs').mkdirSync(screenshotsDir, { recursive: true });
      await this.page.screenshot({
        path: require('path').join(screenshotsDir, `orders-page-${Date.now()}.png`),
        fullPage: true,
        timeout: 15000
      });
    } catch (e) {}

    
    await this.page.waitForSelector('#content', { timeout: 20000 });
  }

  


  async navigateToOrderDetails(orderUrl) {
    await this.page.goto(orderUrl, {
      waitUntil: 'load',  
      timeout: 90000      
    });

    await this.page.waitForTimeout(2000);
  }

  


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

  


  async goToNextPage() {
    const nextButton = await this.page.$(this.selectors.pagination.nextButton);

    if (!nextButton) {
      return false;
    }

    console.log('  → Navigating to next page...');

    
    let currentPageText = '';
    try {
      currentPageText = await this.page.textContent('.pagination', { timeout: 5000 });
    } catch (e) {
      
    }

    
    await nextButton.click({ noWaitAfter: true, timeout: 10000 });

    
    await this.page.waitForTimeout(2000);

    
    try {
      await this.page.waitForSelector('#content', {
        state: 'visible',
        timeout: 15000
      });
    } catch (e) {
      console.log('  ⚠️  Content selector timeout - page might not have updated');
    }

    
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      
      console.log('  ⚠️  Network idle timeout - proceeding anyway');
    }

    
    await this.page.waitForTimeout(2000);

    
    try {
      const newPageText = await this.page.textContent('.pagination', { timeout: 5000 });
      if (currentPageText && newPageText === currentPageText) {
        console.log('  ⚠️  Page may not have changed (pagination text unchanged)');
      }
    } catch (e) {
      
    }

    console.log('  ✓ Page navigation complete');
    return true;
  }
}

module.exports = CustomerConnectNavigator;
