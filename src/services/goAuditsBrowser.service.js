const { chromium } = require('playwright');
const { screenshotsEnabled } = require('../automation/utils/screenshot');

const goAuditsScreenshotsEnabled = () =>
  process.env.GOAUDITS_DEBUG_SCREENSHOTS !== 'false' && screenshotsEnabled();

class GoAuditsBrowserService {
  constructor() {
    this.baseUrl = process.env.GOAUDITS_BASE_URL || 'https://admin.goaudits.com';
    this.email = process.env.GOAUDITS_EMAIL;
    this.password = process.env.GOAUDITS_PASSWORD;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async _captureScreenshot(filePath) {
    if (!goAuditsScreenshotsEnabled() || !this.page) return;
    try {
      await this.page.screenshot({ path: filePath });
      console.error(`   Screenshot saved to ${filePath}`);
    } catch (e) {}
  }

  async initialize() {
    if (this.browser && this.page) {
      console.log('✓ Browser already initialized, reusing existing session');
      return true;
    }

    try {
      console.log('🌐 Launching browser for GoAudits automation...');

      this.browser = await chromium.launch({
        headless: (process.env.HEADLESS === 'false' && !!process.env.DISPLAY) ? false : true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        timeout: parseInt(process.env.BROWSER_TIMEOUT) || 60000
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });

      this.page = await this.context.newPage();

      await this.login();

      return true;
    } catch (error) {
      console.error('✗ Failed to initialize browser:', error);
      await this.cleanup();
      throw error;
    }
  }

  async login() {
    try {
      console.log('🔐 Logging into GoAudits admin portal...');

      await this.page.goto(`${this.baseUrl}/#/authentication/signin`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await this.page.waitForTimeout(3000);

      const currentUrl = this.page.url();
      if (currentUrl.includes('/dashboard') || currentUrl.includes('/home') || currentUrl.includes('/locations') || currentUrl.includes('/templates')) {
        console.log('✓ Already logged in to GoAudits');
        return true;
      }

      await this.page.waitForSelector('input[formcontrolname="username"]', { timeout: 10000, state: 'visible' });
      console.log('   Found email field');

      await this.page.waitForSelector('input[formcontrolname="password"]', { timeout: 10000, state: 'visible' });
      console.log('   Found password field');

      await this.page.fill('input[formcontrolname="username"]', this.email);
      await this.page.fill('input[formcontrolname="password"]', this.password);

      console.log('   Credentials filled, clicking login button...');

      await this.page.click('button[type="submit"]:has-text("Login")');

      try {
        await this.page.waitForURL(/\/#\/(dashboard|home|locations|templates)/, { timeout: 30000 });
        console.log('✓ Successfully logged in to GoAudits');
      } catch (e) {
        await this.page.waitForTimeout(3000);
        const newUrl = this.page.url();
        if (!newUrl.includes('/signin') && !newUrl.includes('/login')) {
          console.log(`✓ Login appeared to succeed (now on: ${newUrl})`);
          return true;
        }

        await this._captureScreenshot('/tmp/goaudits-after-login.png');
        throw new Error(`Login may have failed - still on signin page.`);
      }

      return true;
    } catch (error) {
      console.error('✗ Login failed:', error.message);
      await this._captureScreenshot('/tmp/goaudits-login-error.png');
      throw new Error(`Failed to login to GoAudits: ${error.message}`);
    }
  }

  async createLocation(locationData) {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      console.log(`📍 Creating location via web form: ${locationData.store_name}...`);

      console.log('   Navigating to https://admin.goaudits.com/#/locations/add');
      await this.page.goto(`${this.baseUrl}/#/locations/add`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      console.log('   Waiting for Angular to load form...');
      await this.page.waitForTimeout(3000);

      console.log('   Waiting for form fields to appear...');
      try {
        await this.page.waitForSelector('input[formcontrolname="store_name"]', {
          timeout: 20000,
          state: 'visible'
        });
        console.log('   ✓ Form loaded successfully');
      } catch (error) {
        console.log('   Form not loaded, refreshing page...');
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(3000);
        await this.page.waitForSelector('input[formcontrolname="store_name"]', {
          timeout: 20000,
          state: 'visible'
        });
        console.log('   ✓ Form loaded after refresh');
      }

      console.log(`   Filling location name: ${locationData.store_name}`);
      await this.page.fill('input[formcontrolname="store_name"]', locationData.store_name);

      if (locationData.location_code) {
        console.log(`   Filling location code: ${locationData.location_code}`);
        await this.page.fill('input[formcontrolname="location_code"]', locationData.location_code);
      }

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

      if (locationData.address) {
        console.log(`   Filling address`);
        await this.page.fill('textarea[formcontrolname="address"]', locationData.address);
      }

      if (locationData.postcode) {
        console.log(`   Filling postcode: ${locationData.postcode}`);
        await this.page.fill('input[formcontrolname="postcode"]', locationData.postcode);
      }

      if (locationData.latitude) {
        console.log(`   Filling latitude: ${locationData.latitude}`);
        await this.page.fill('input[formcontrolname="latitude"]', String(locationData.latitude));
      }

      if (locationData.longitude) {
        console.log(`   Filling longitude: ${locationData.longitude}`);
        await this.page.fill('input[formcontrolname="longitude"]', String(locationData.longitude));
      }

      if (locationData.toemail) {
        console.log(`   Filling email: ${locationData.toemail}`);
        await this.page.fill('input[formcontrolname="toemail"]', locationData.toemail);
      }

      if (locationData.ccemail) {
        console.log(`   Filling CC email: ${locationData.ccemail}`);
        await this.page.fill('input[formcontrolname="ccemail"]', locationData.ccemail);
      }

      if (locationData.bccemail) {
        console.log(`   Filling BCC email: ${locationData.bccemail}`);
        await this.page.fill('input[formcontrolname="bccemail"]', locationData.bccemail);
      }

      console.log('   All fields filled, clicking Save button...');

      await this.page.click('button[color="primary"]:has-text("Save")');

      console.log('   Waiting for save to complete...');
      try {
        await this.page.waitForURL(/\/#\/locations$/, { timeout: 10000 });
        console.log(`✓ Location created successfully: ${locationData.store_name}`);
        return { success: true, store_name: locationData.store_name };
      } catch (e) {
        await this.page.waitForTimeout(2000);
        const errorMessage = await this.page.textContent('.mat-error, .error, .alert-danger').catch(() => null);
        if (errorMessage) {
          console.error(`   Form validation error: ${errorMessage}`);
          throw new Error(`Form validation error: ${errorMessage}`);
        }

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
      await this._captureScreenshot(`/tmp/goaudits-create-error-${Date.now()}.png`);
      throw new Error(`Failed to create location: ${error.message}`);
    }
  }

  async createMultipleLocations(locationsData) {
    const results = [];
    try {
      await this.initialize();
      for (const locationData of locationsData) {
        try {
          const result = await this.createLocation(locationData);
          results.push({ ...result, success: true });
          await this.page.waitForTimeout(1000);
        } catch (error) {
          results.push({
            store_name: locationData.store_name,
            success: false,
            error: error.message,
          });
        }
      }
      return results;
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    try {
      if (this.page) await this.page.close().catch(() => {});
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }
}

module.exports = new GoAuditsBrowserService();
