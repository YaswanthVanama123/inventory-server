



require('dotenv').config();
const { chromium } = require('playwright');

async function progressiveTest() {
  console.log('\n========================================');
  console.log('Progressive Navigation Strategy Test');
  console.log('========================================\n');

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  const strategies = [
    { name: 'domcontentloaded', waitUntil: 'domcontentloaded', extraWait: 3000 },
    { name: 'load', waitUntil: 'load', extraWait: 2000 },
    { name: 'networkidle (30s timeout)', waitUntil: 'networkidle', timeout: 30000, extraWait: 1000 }
  ];

  let successfulStrategy = null;

  for (const strategy of strategies) {
    console.log(`\n🔄 Trying strategy: ${strategy.name}`);
    console.log('─'.repeat(50));

    try {
      const startTime = Date.now();

      await page.goto('https://envirostore.mycustomerconnect.com/index.php?route=account/login&SSL', {
        waitUntil: strategy.waitUntil,
        timeout: strategy.timeout || 90000
      });

      
      if (strategy.extraWait) {
        await page.waitForTimeout(strategy.extraWait);
      }

      const elapsed = Date.now() - startTime;
      console.log(`✓ Navigation successful!`);
      console.log(`  Time: ${elapsed}ms`);
      console.log(`  URL: ${page.url()}`);

      
      const usernameInput = await page.$('input[name="email"]');
      const passwordInput = await page.$('input[name="password"]');
      const submitButton = await page.$('input[type="submit"][value="Login"]');

      if (usernameInput && passwordInput && submitButton) {
        console.log(`✓ Login form found!`);
        successfulStrategy = strategy.name;
        break;
      } else {
        console.log(`⚠️  Form elements missing`);
      }

    } catch (error) {
      console.log(`✗ Strategy failed: ${error.message.split('\n')[0]}`);
    }
  }

  if (successfulStrategy) {
    console.log('\n========================================');
    console.log(`✅ SUCCESS! Best strategy: ${successfulStrategy}`);
    console.log('========================================\n');

    
    console.log('Testing login...\n');

    try {
      await page.fill('input[name="email"]', process.env.CUSTOMERCONNECT_USERNAME);
      await page.fill('input[name="password"]', process.env.CUSTOMERCONNECT_PASSWORD);

      console.log('Submitting login form...');

      const startTime = Date.now();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 90000 }),
        page.click('input[type="submit"][value="Login"]')
      ]);

      await page.waitForTimeout(2000);

      const elapsed = Date.now() - startTime;
      const currentUrl = page.url();

      console.log(`Login completed (${elapsed}ms)`);
      console.log(`Current URL: ${currentUrl}`);

      if (!currentUrl.includes('login')) {
        console.log('\n✅ Login successful!');
        await page.screenshot({ path: 'login-success.png', timeout: 15000 });
        console.log('Screenshot saved: login-success.png');
      } else {
        console.log('\n⚠️  Still on login page');
        await page.screenshot({ path: 'login-failed.png', timeout: 15000 });
        console.log('Screenshot saved: login-failed.png');
      }

    } catch (error) {
      console.error(`\n❌ Login error: ${error.message}`);
    }

  } else {
    console.log('\n========================================');
    console.log('❌ All strategies failed');
    console.log('========================================\n');
  }

  if (process.env.HEADLESS !== 'false') {
    await browser.close();
  } else {
    console.log('\nKeeping browser open for 5 seconds...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

progressiveTest().catch(console.error);
