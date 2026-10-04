
require('dotenv').config();
const RouteStarAutomation = require('./src/automation/routestar');

async function testInvoiceDetails() {
  const automation = new RouteStarAutomation();

  try {
    console.log('🚀 Starting invoice details test...\n');

    console.log('📱 Initializing browser...');
    await automation.init();

    console.log('🔐 Logging in...');
    await automation.login();

    const testInvoices = [
      'https://emnrv.routestar.online/web/invoicedetails/NRV5289',
      'https://emnrv.routestar.online/web/invoicedetails/NRV5488',
      'https://emnrv.routestar.online/web/invoicedetails/NRV5707'
    ];

    console.log(`\n📄 Testing ${testInvoices.length} invoices that previously showed 0 items...\n`);

    for (const invoiceUrl of testInvoices) {
      const invoiceNumber = invoiceUrl.split('/').pop();

      console.log(`\n${'='.repeat(60)}`);
      console.log(`Testing Invoice: ${invoiceNumber}`);
      console.log(`${'='.repeat(60)}`);

      try {
        const details = await automation.fetchInvoiceDetails(invoiceUrl);

        console.log('\n✅ Invoice Details Extracted:');
        console.log(`   - Item Count: ${details.items.length}`);
        console.log(`   - Subtotal: $${details.subtotal}`);
        console.log(`   - Tax: $${details.tax}`);
        console.log(`   - Total: $${details.total}`);

        if (details.items.length > 0) {
          console.log('\n📦 Line Items:');
          details.items.forEach((item, idx) => {
            console.log(`   ${idx + 1}. ${item.name}`);
            console.log(`      Description: ${item.description}`);
            console.log(`      Quantity: ${item.quantity}`);
            console.log(`      Rate: $${item.rate}`);
            console.log(`      Amount: $${item.amount}`);
            console.log(`      Class: ${item.class}`);
            console.log(`      Warehouse: ${item.warehouse}`);
            console.log(`      Tax Code: ${item.taxCode}`);
            console.log(`      Location: ${item.location}`);
          });
        } else {
          console.log('\n⚠️  WARNING: No line items extracted!');
        }

        console.log('\n✅ Success\n');
      } catch (error) {
        console.error(`\n❌ Error fetching ${invoiceNumber}:`);
        console.error(`   ${error.message}\n`);
      }
    }

    console.log('\n✨ Test completed!');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
  } finally {
    console.log('\n🔒 Closing browser...');
    await automation.close();
    console.log('✅ Browser closed\n');
  }
}

testInvoiceDetails().catch(console.error);
