/**
 * Diagnostic script to check invoice details status
 *
 * Usage: node check-invoice-details.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const RouteStarInvoice = require('./src/models/RouteStarInvoice');

async function checkInvoiceDetails() {
  try {
    console.log('🔌 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory');
    console.log('✅ Connected to MongoDB\n');

    console.log('📊 Analyzing invoice details status...\n');

    // Total invoices
    const totalInvoices = await RouteStarInvoice.countDocuments();
    console.log(`Total invoices in database: ${totalInvoices}`);

    // Invoices without lineItems field
    const withoutLineItems = await RouteStarInvoice.countDocuments({
      lineItems: { $exists: false }
    });
    console.log(`Invoices without lineItems field: ${withoutLineItems}`);

    // Invoices with empty lineItems array
    const emptyLineItems = await RouteStarInvoice.countDocuments({
      lineItems: { $size: 0 }
    });
    console.log(`Invoices with empty lineItems array: ${emptyLineItems}`);

    // Invoices with lineItems data
    const withLineItems = await RouteStarInvoice.countDocuments({
      lineItems: { $exists: true, $ne: [] }
    });
    console.log(`Invoices with lineItems data: ${withLineItems}`);

    console.log('\n📝 Sample invoices with different statuses:\n');

    // Sample without lineItems
    const sampleWithout = await RouteStarInvoice.findOne({
      lineItems: { $exists: false }
    }).select('invoiceNumber status');
    if (sampleWithout) {
      console.log(`Without lineItems field: ${sampleWithout.invoiceNumber} (${sampleWithout.status})`);
    }

    // Sample with empty array
    const sampleEmpty = await RouteStarInvoice.findOne({
      lineItems: { $size: 0 }
    }).select('invoiceNumber status lineItems');
    if (sampleEmpty) {
      console.log(`With empty array: ${sampleEmpty.invoiceNumber} (${sampleEmpty.status}) - lineItems: ${JSON.stringify(sampleEmpty.lineItems)}`);
    }

    // Sample with data
    const sampleWith = await RouteStarInvoice.findOne({
      lineItems: { $exists: true, $ne: [] }
    }).select('invoiceNumber status lineItems');
    if (sampleWith) {
      console.log(`With lineItems data: ${sampleWith.invoiceNumber} (${sampleWith.status}) - ${sampleWith.lineItems.length} items`);
    }

    console.log('\n✅ Analysis complete');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n🔌 Closing database connection...');
    await mongoose.connection.close();
    console.log('✅ Database closed\n');
  }
}

// Run the script
checkInvoiceDetails();
