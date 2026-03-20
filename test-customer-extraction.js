// Test script to check customer table column structure
const RouteStarAutomation = require('./src/automation/routestar');

async function testCustomerExtraction() {
  console.log('🔍 Testing customer table column structure...\n');

  const automation = new RouteStarAutomation();

  try {
    await automation.init();
    await automation.login();

    // Navigate to customers page
    await automation.navigator.navigateToCustomers();
    await automation.page.waitForTimeout(3000);

    // Check if table exists
    const masterTable = await automation.page.$('div.ht_master');
    if (!masterTable) {
      console.log('❌ No customer table found');
      return;
    }

    console.log('✓ Found customer table\n');

    // Get first row
    const rows = await masterTable.$$('table.htCore tbody tr');
    console.log(`Found ${rows.length} rows\n`);

    if (rows.length > 0) {
      const firstRow = rows[0];

      // Count columns
      const cells = await firstRow.$$('td');
      console.log(`First row has ${cells.length} columns\n`);

      // Extract each column's content
      console.log('Column contents:');
      console.log('================\n');

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const text = await cell.textContent();
        const innerHTML = await cell.innerHTML();

        console.log(`Column ${i + 1}:`);
        console.log(`  Text: ${text.trim().substring(0, 100)}`);
        console.log(`  HTML: ${innerHTML.substring(0, 150)}...`);
        console.log('');
      }
    }

    await automation.close();
  } catch (error) {
    console.error('❌ Error:', error);
    await automation.close();
  }
}

testCustomerExtraction();
