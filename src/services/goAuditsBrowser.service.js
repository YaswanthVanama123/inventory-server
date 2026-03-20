const { chromium } = require('playwright');

class GoAuditsBrowserService {
  constructor() {
    this.baseUrl = process.env.GOAUDITS_BASE_URL || 'https://admin.goaudits.com';
    this.email = process.env.GOAUDITS_EMAIL;
    this.password = process.env.GOAUDITS_PASSWORD;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Initialize browser and login to GoAudits
   */
  async initialize() {
    // If already initialized, don't reinitialize
    if (this.browser && this.page) {
      console.log('✓ Browser already initialized, reusing existing session');
      return true;
    }

    try {
      console.log('🌐 Launching browser for GoAudits automation...');

      this.browser = await chromium.launch({
        headless: process.env.HEADLESS === 'true',
        timeout: parseInt(process.env.BROWSER_TIMEOUT) || 60000
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });

      this.page = await this.context.newPage();

      // Login to GoAudits
      await this.login();

      return true;
    } catch (error) {
      console.error('✗ Failed to initialize browser:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Login to GoAudits admin portal
   */
  async login() {
    try {
      console.log('🔐 Logging into GoAudits admin portal...');

      // Navigate to the correct signin page
      await this.page.goto(`${this.baseUrl}/#/authentication/signin`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // Wait for Angular app to load
      await this.page.waitForTimeout(3000);

      // Check if already logged in (might redirect to dashboard)
      const currentUrl = this.page.url();
      if (currentUrl.includes('/dashboard') || currentUrl.includes('/home') || currentUrl.includes('/locations') || currentUrl.includes('/templates')) {
        console.log('✓ Already logged in to GoAudits');
        return true;
      }

      // Wait for login form to be visible
      await this.page.waitForSelector('input[formcontrolname="username"]', { timeout: 10000, state: 'visible' });
      console.log('   Found email field');

      await this.page.waitForSelector('input[formcontrolname="password"]', { timeout: 10000, state: 'visible' });
      console.log('   Found password field');

      // Fill in credentials
      await this.page.fill('input[formcontrolname="username"]', this.email);
      await this.page.fill('input[formcontrolname="password"]', this.password);

      console.log('   Credentials filled, clicking login button...');

      // Click login button
      await this.page.click('button[type="submit"]:has-text("Login")');

      // Wait for navigation after login
      try {
        await this.page.waitForURL(/\/#\/(dashboard|home|locations|templates)/, { timeout: 30000 });
        console.log('✓ Successfully logged in to GoAudits');
      } catch (e) {
        // Check if we're on a different page now (login might have succeeded)
        await this.page.waitForTimeout(3000);
        const newUrl = this.page.url();
        if (!newUrl.includes('/signin') && !newUrl.includes('/login')) {
          console.log(`✓ Login appeared to succeed (now on: ${newUrl})`);
          return true;
        }

        // Take screenshot for debugging
        await this.page.screenshot({ path: '/tmp/goaudits-after-login.png' });
        throw new Error(`Login may have failed - still on signin page. Screenshot saved to /tmp/goaudits-after-login.png`);
      }

      return true;
    } catch (error) {
      console.error('✗ Login failed:', error.message);
      // Take screenshot for debugging
      try {
        await this.page.screenshot({ path: '/tmp/goaudits-login-error.png' });
        console.error('   Screenshot saved to /tmp/goaudits-login-error.png');
      } catch (e) {
        // Ignore screenshot errors
      }
      throw new Error(`Failed to login to GoAudits: ${error.message}`);
    }
  }

  /**
   * Create a new location via web form (assumes browser is already initialized)
   */
  async createLocation(locationData) {
    // Check if browser is initialized
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      console.log(`📍 Creating location via web form: ${locationData.store_name}...`);

      // Navigate to add location page
      console.log('   Navigating to https://admin.goaudits.com/#/locations/add');
      await this.page.goto(`${this.baseUrl}/#/locations/add`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Wait for Angular to render - increased timeout and better wait strategy
      console.log('   Waiting for Angular to load form...');
      await this.page.waitForTimeout(3000);

      // Wait for form to load with multiple retries
      console.log('   Waiting for form fields to appear...');
      try {
        await this.page.waitForSelector('input[formcontrolname="store_name"]', {
          timeout: 20000,
          state: 'visible'
        });
        console.log('   ✓ Form loaded successfully');
      } catch (error) {
        // If form doesn't load, try refreshing the page
        console.log('   Form not loaded, refreshing page...');
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(3000);
        await this.page.waitForSelector('input[formcontrolname="store_name"]', {
          timeout: 20000,
          state: 'visible'
        });
        console.log('   ✓ Form loaded after refresh');
      }

      // Company is already selected by default (Enviro-Master Northern Virginia)
      // No need to select it

      // Fill in Location name (REQUIRED)
      console.log(`   Filling location name: ${locationData.store_name}`);
      await this.page.fill('input[formcontrolname="store_name"]', locationData.store_name);

      // Fill in Location code
      if (locationData.location_code) {
        console.log(`   Filling location code: ${locationData.location_code}`);
        await this.page.fill('input[formcontrolname="location_code"]', locationData.location_code);
      }

      // Time zone - keep default GMT +00:00 or change if needed
      if (locationData.time_zone && locationData.time_zone !== 'GMT +00:00') {
        console.log(`   Setting time zone: ${locationData.time_zone}`);
        try {
          await this.page.click('mat-select[formcontrolname="time_zone"]');
          await this.page.waitForTimeout(500);
          await this.page.click(`mat-option:has-text("${locationData.time_zone}")`);
        } catch (e) {
          console.log('   Time zone selection failed, keeping default');
        }
      }

      // Fill in Address
      if (locationData.address) {
        console.log(`   Filling address`);
        await this.page.fill('textarea[formcontrolname="address"]', locationData.address);
      }

      // Fill in Postcode
      if (locationData.postcode) {
        console.log(`   Filling postcode: ${locationData.postcode}`);
        await this.page.fill('input[formcontrolname="postcode"]', locationData.postcode);
      }

      // Fill in Latitude
      if (locationData.latitude) {
        console.log(`   Filling latitude: ${locationData.latitude}`);
        await this.page.fill('input[formcontrolname="latitude"]', String(locationData.latitude));
      }

      // Fill in Longitude
      if (locationData.longitude) {
        console.log(`   Filling longitude: ${locationData.longitude}`);
        await this.page.fill('input[formcontrolname="longitude"]', String(locationData.longitude));
      }

      // Fill in To Email
      if (locationData.toemail) {
        console.log(`   Filling email: ${locationData.toemail}`);
        await this.page.fill('input[formcontrolname="toemail"]', locationData.toemail);
      }

      // Fill in CC Email
      if (locationData.ccemail) {
        console.log(`   Filling CC email: ${locationData.ccemail}`);
        await this.page.fill('input[formcontrolname="ccemail"]', locationData.ccemail);
      }

      // Fill in BCC Email
      if (locationData.bccemail) {
        console.log(`   Filling BCC email: ${locationData.bccemail}`);
        await this.page.fill('input[formcontrolname="bccemail"]', locationData.bccemail);
      }

      console.log('   All fields filled, clicking Save button...');

      // Click Save button
      await this.page.click('button[color="primary"]:has-text("Save")');

      // Wait for save to complete - either navigation or success message
      console.log('   Waiting for save to complete...');
      try {
        await this.page.waitForURL(/\/#\/locations$/, { timeout: 10000 });
        console.log(`✓ Location created successfully: ${locationData.store_name}`);
        return { success: true, store_name: locationData.store_name };
      } catch (e) {
        // Check for error messages
        await this.page.waitForTimeout(2000);
        const errorMessage = await this.page.textContent('.mat-error, .error, .alert-danger').catch(() => null);
        if (errorMessage) {
          console.error(`   Form validation error: ${errorMessage}`);
          throw new Error(`Form validation error: ${errorMessage}`);
        }

        // Check if still on the add page or moved to locations list
        const currentUrl = this.page.url();
        if (currentUrl.includes('/locations') && !currentUrl.includes('/add')) {
          console.log(`✓ Location created: ${locationData.store_name} (URL changed to ${currentUrl})`);
          return { success: true, store_name: locationData.store_name };
        }

        console.log(`   Assuming success (current URL: ${currentUrl})`);
        return { success: true, store_name: locationData.store_name };
      }

    } catch (error) {
      console.error(`✗ Failed to create location ${locationData.store_name}:`, error.message);

      // Take screenshot for debugging
      try {
        const screenshotPath = `/tmp/goaudits-create-error-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath });
        console.error(`   Screenshot saved to ${screenshotPath}`);
      } catch (e) {
        // Ignore screenshot errors
      }

      throw new Error(`Failed to create location: ${error.message}`);
    }
  }

  /**
   * Create multiple locations
   */
  async createMultipleLocations(locationsData) {
    try {
      await this.initialize();

      const results = [];
      for (const locationData of locationsData) {
        try {
          const result = await this.createLocation(locationData);
          results.push({ ...result, success: true });

          // Small delay between creations
          await this.page.waitForTimeout(1000);
        } catch (error) {
          results.push({
            store_name: locationData.store_name,
            success: false,
            error: error.message
          });
        }
      }

      await this.cleanup();
      return results;

    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup() {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();

      this.page = null;
      this.context = null;
      this.browser = null;
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

module.exports = new GoAuditsBrowserService();
