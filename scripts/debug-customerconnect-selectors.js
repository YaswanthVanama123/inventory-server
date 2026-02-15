require('dotenv').config();
const { chromium } = require('playwright');







async function debugSelectors() {
  console.log('🔍 CustomerConnect Selector Debug Tool\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    
    console.log('1️⃣ Logging in...');
    await page.goto(process.env.CUSTOMER_CONNECT_URL);
    await page.fill('input[name="email"]', process.env.CUSTOMER_CONNECT_USERNAME);
    await page.fill('input[name="password"]', process.env.CUSTOMER_CONNECT_PASSWORD);
    await page.click('input[type="submit"][value="Login"]');
    await page.waitForLoadState('networkidle');
    console.log('   ✓ Logged in\n');

    
    console.log('2️⃣ Navigating to Orders page...');
    await page.click('a[href*="account/orders"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('   ✓ On Orders page\n');

    
    console.log('3️⃣ Inspecting Order Row HTML:\n');
    console.log('─'.repeat(80));

    const orderDivs = await page.$$('div:has-text("Order ID:")');

    if (orderDivs.length === 0) {
      console.log('❌ No order rows found!');
      console.log('   Current selectors may be incorrect.');
      console.log('\n📄 Full page HTML (first 2000 chars):');
      const html = await page.content();
      console.log(html.substring(0, 2000));
    } else {
      console.log(`✓ Found ${orderDivs.length} order rows\n`);

      
      const firstOrderHtml = await orderDivs[0].innerHTML();
      console.log('📦 First Order Row HTML:\n');
      console.log(firstOrderHtml);
      console.log('\n' + '─'.repeat(80));

      
      const links = await orderDivs[0].$$('a');
      console.log(`\n🔗 Found ${links.length} <a> tags in first order row:\n`);

      for (let i = 0; i < links.length; i++) {
        const href = await links[i].getAttribute('href');
        const text = await links[i].textContent();
        const classes = await links[i].getAttribute('class');
        console.log(`   Link ${i + 1}:`);
        console.log(`      href: ${href}`);
        console.log(`      text: ${text?.trim()}`);
        console.log(`      class: ${classes || 'none'}`);
        console.log('');
      }

      
      console.log('📋 Extracting Order Data:\n');
      const fullText = await orderDivs[0].textContent();
      console.log('   Full Text Content:');
      console.log(fullText);
      console.log('');

      const orderIdMatch = fullText.match(/Order ID:\s*#?(\d+)/i);
      console.log(`   Order Number: ${orderIdMatch ? orderIdMatch[1] : 'NOT FOUND'}`);

      const statusMatch = fullText.match(/Status:\s*([^\n]+)/i);
      console.log(`   Status: ${statusMatch ? statusMatch[1].trim() : 'NOT FOUND'}`);

      const dateMatch = fullText.match(/Date Added:\s*(\d{2}\/\d{2}\/\d{4})/i);
      console.log(`   Date: ${dateMatch ? dateMatch[1] : 'NOT FOUND'}`);

      const totalMatch = fullText.match(/Total:\s*\$?([\d,]+\.?\d*)/i);
      console.log(`   Total: ${totalMatch ? totalMatch[1] : 'NOT FOUND'}`);

      const vendorMatch = fullText.match(/Vendor\(s\):\s*([^,\n]+)/i);
      console.log(`   Vendor: ${vendorMatch ? vendorMatch[1].trim() : 'NOT FOUND'}`);

      const poMatch = fullText.match(/PO Number\(s\):\s*([^,\n]+)/i);
      console.log(`   PO Number: ${poMatch ? poMatch[1].trim() : 'NOT FOUND'}`);
    }

    console.log('\n' + '─'.repeat(80));
    console.log('\n✅ Debug complete! Review the output above to find the correct selectors.');
    console.log('\n💡 Recommended Next Steps:');
    console.log('   1. Look for the <a> tag that contains the order detail link');
    console.log('   2. Note any unique class names or attributes');
    console.log('   3. Update the selector in: src/automation/selectors/customerconnect.selectors.js');
    console.log('   4. Change orderLink from \'a\' to something more specific');
    console.log('   5. Example: \'a.button-info\', \'a[href*="order_id"]\', etc.\n');

    
    console.log('⏸️  Browser will stay open for 60 seconds for manual inspection...');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
    console.log('\n👋 Browser closed. Exiting...\n');
  }
}

debugSelectors();
