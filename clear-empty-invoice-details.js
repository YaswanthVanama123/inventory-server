/**
 * Script to clear invoice details for invoices with 0 items
 * This allows them to be re-fetched with the fixed scraper
 *
 * Usage: node clear-empty-invoice-details.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const RouteStarInvoice = require('./src/models/RouteStarInvoice');

async function clearEmptyInvoiceDetails() {
  try {
    console.log('🔌 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory');
    console.log('✅ Connected to MongoDB\n');

    console.log('🔍 Finding invoices with empty or missing line items...');

    // Find invoices that have 0 items or missing lineItems
    const emptyInvoices = await RouteStarInvoice.find({
      $or: [
        { lineItems: { $exists: false } },
        { lineItems: { $size: 0 } },
        { lineItems: [] }
      ]
    }).select('invoiceNumber status lineItems');

    console.log(`📊 Found ${emptyInvoices.length} invoices with empty details\n`);

    if (emptyInvoices.length === 0) {
      console.log('✅ No invoices need clearing!');
      return;
    }

    // Show sample of invoices that will be cleared
    console.log('Sample invoices that will be cleared:');
    emptyInvoices.slice(0, 10).forEach(inv => {
      console.log(`   - ${inv.invoiceNumber} (${inv.status})`);
    });
    if (emptyInvoices.length > 10) {
      console.log(`   ... and ${emptyInvoices.length - 10} more\n`);
    }

    console.log('\n🗑️  Clearing lineItems field to force re-fetch...');

    // Unset the lineItems, subtotal, tax, total fields so they'll be re-fetched
    const result = await RouteStarInvoice.updateMany(
      {
        $or: [
          { lineItems: { $exists: false } },
          { lineItems: { $size: 0 } },
          { lineItems: [] }
        ]
      },
      {
        $unset: {
          lineItems: "",
          subtotal: "",
          tax: "",
          total: "",
          signedBy: "",
          invoiceMemo: "",
          serviceNotes: "",
          salesTaxRate: ""
        }
      }
    );

    console.log(`✅ Cleared details for ${result.modifiedCount} invoices\n`);
    console.log('📝 These invoices will be re-fetched in the next sync');

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
clearEmptyInvoiceDetails();
