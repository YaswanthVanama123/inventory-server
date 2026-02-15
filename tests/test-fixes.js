




require('dotenv').config();
const { chromium } = require('playwright');

async function testFixes() {
  console.log('\n========================================');
  console.log('CustomerConnect Fix Verification Test');
  console.log('========================================\n');

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    slowMo: 50,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-extensions'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  page.setDefaultTimeout(90000); 

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    
    console.log('Test 1: Navigation with SSL parameter...');
    let startTime = Date.now();

    try {
      await page.goto('https://envirostore.mycustomerconnect.com/index.php?route=account/login&SSL', {
        waitUntil: 'networkidle',
        timeout: 90000
      });

      const elapsed = Date.now() - startTime;
      console.log(`✓ Navigation successful (${elapsed}ms)`);
      console.log(`  Final URL: ${page.url()}`);
      testsPassed++;
    } catch (error) {
      console.log(`✗ Navigation failed: ${error.message}`);
      testsFailed++;
    }

    await page.waitForTimeout(2000);

    
    console.log('\nTest 2: Login form elements...');

    try {
      const usernameInput = await page.$('input[name="email"]');
      const passwordInput = await page.$('input[name="password"]');
      const submitButton = await page.$('input[type="submit"][value="Login"]');

      if (usernameInput && passwordInput && submitButton) {
        console.log('✓ All login form elements found');
        testsPassed++;
      } else {
        console.log('✗ Missing login form elements');
        console.log(`  Username: ${usernameInput ? 'Found' : 'Missing'}`);
        console.log(`  Password: ${passwordInput ? 'Found' : 'Missing'}`);
        console.log(`  Submit: ${submitButton ? 'Found' : 'Missing'}`);
        testsFailed++;
      }
    } catch (error) {
      console.log(`✗ Error checking form elements: ${error.message}`);
      testsFailed++;
    }

    
    console.log('\nTest 3: Login attempt...');

    try {
      await page.fill('input[name="email"]', process.env.CUSTOMERCONNECT_USERNAME);
      await page.fill('input[name="password"]', process.env.CUSTOMERCONNECT_PASSWORD);

      console.log('  Filled credentials');

      startTime = Date.now();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 90000 }),
        page.click('input[type="submit"][value="Login"]')
      ]);

      const elapsed = Date.now() - startTime;
      console.log(`  Login navigation completed (${elapsed}ms)`);

      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      console.log(`  Current URL: ${currentUrl}`);

      if (currentUrl.includes('account/account') || !currentUrl.includes('login')) {
        console.log('✓ Login successful!');
        testsPassed++;
      } else {
        console.log('⚠️  Login may have failed (still on login page)');

        
        const errorMsg = await page.$('.alert-danger, .warning, .error');
        if (errorMsg) {
          const errorText = await errorMsg.textContent();
          console.log(`  Error: ${errorText.trim()}`);
        }
        testsFailed++;
      }
    } catch (error) {
      console.log(`✗ Login failed: ${error.message}`);
      testsFailed++;
    }

    
    console.log('\nTest 4: Screenshot with increased timeout...');

    try {
      await page.screenshot({
        path: 'test-screenshot.png',
        fullPage: true,
        timeout: 15000
      });
      console.log('✓ Screenshot captured successfully');
      testsPassed++;
    } catch (error) {
      console.log(`✗ Screenshot failed: ${error.message}`);
      testsFailed++;
    }

    
    console.log('\n========================================');
    console.log('Test Summary');
    console.log('========================================');
    console.log(`✓ Passed: ${testsPassed}`);
    console.log(`✗ Failed: ${testsFailed}`);
    console.log(`  Total: ${testsPassed + testsFailed}`);

    if (testsFailed === 0) {
      console.log('\n✅ All tests passed! The fixes are working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
  } finally {
    if (process.env.HEADLESS !== 'false') {
      await browser.close();
    } else {
      console.log('Browser kept open for inspection (5 seconds)...');
      await page.waitForTimeout(5000);
      await browser.close();
    }
  }
}


testFixes().catch(console.error);
