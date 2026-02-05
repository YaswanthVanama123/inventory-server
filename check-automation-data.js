require('dotenv').config();
const mongoose = require('mongoose');

async function checkAutomationData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const CustomerConnectOrder = require('./src/models/CustomerConnectOrder');
    const RouteStarInvoice = require('./src/models/RouteStarInvoice');
    const StockMovement = require('./src/models/StockMovement');
    const StockSummary = require('./src/models/StockSummary');
    const Inventory = require('./src/models/Inventory');

    console.log('📊 AUTOMATION DATA STATUS:\n');

    // Check CustomerConnect Orders
    const ccOrders = await CustomerConnectOrder.countDocuments();
    console.log(`CustomerConnect Orders: ${ccOrders}`);
    if (ccOrders > 0) {
      const sampleOrder = await CustomerConnectOrder.findOne().lean();
      console.log(`  Sample Order Number: ${sampleOrder.orderNumber}`);
      console.log(`  Stock Processed: ${sampleOrder.stockProcessed}`);
      console.log(`  Line Items: ${sampleOrder.lineItems?.length || 0}`);
    }

    // Check RouteStar Invoices
    const rsInvoices = await RouteStarInvoice.countDocuments();
    console.log(`\nRouteStar Invoices: ${rsInvoices}`);
    if (rsInvoices > 0) {
      const sampleInvoice = await RouteStarInvoice.findOne().lean();
      console.log(`  Sample Invoice Number: ${sampleInvoice.invoiceNumber}`);
      console.log(`  Stock Processed: ${sampleInvoice.stockProcessed}`);
      console.log(`  Line Items: ${sampleInvoice.lineItems?.length || 0}`);
    }

    // Check Stock Movements
    const movements = await StockMovement.countDocuments();
    console.log(`\nStock Movements: ${movements}`);
    if (movements > 0) {
      const sampleMovement = await StockMovement.findOne().lean();
      console.log(`  Sample Movement:`);
      console.log(`    SKU: ${sampleMovement.sku}`);
      console.log(`    Type: ${sampleMovement.type}`);
      console.log(`    Qty: ${sampleMovement.qty}`);
      console.log(`    RefType: ${sampleMovement.refType}`);
    }

    // Check Stock Summary
    const summaries = await StockSummary.countDocuments();
    console.log(`\nStock Summaries: ${summaries}`);
    if (summaries > 0) {
      const sampleSummary = await StockSummary.findOne().lean();
      console.log(`  Sample Summary:`);
      console.log(`    SKU: ${sampleSummary.sku}`);
      console.log(`    Available: ${sampleSummary.availableQty}`);
      console.log(`    Total IN: ${sampleSummary.totalInQty}`);
      console.log(`    Total OUT: ${sampleSummary.totalOutQty}`);
    }

    // Check Inventory items
    const inventoryCount = await Inventory.countDocuments();
    console.log(`\nInventory Items: ${inventoryCount}`);

    const syncedItems = await Inventory.countDocuments({
      'syncMetadata.isSynced': true
    });
    console.log(`  Synced Items: ${syncedItems}`);

    if (syncedItems > 0) {
      const syncedItem = await Inventory.findOne({ 'syncMetadata.isSynced': true }).lean();
      console.log(`  Sample Synced Item:`);
      console.log(`    SKU: ${syncedItem.skuCode}`);
      console.log(`    Source: ${syncedItem.syncMetadata.source}`);
      console.log(`    Last Synced: ${syncedItem.syncMetadata.lastSyncedAt}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY:');
    console.log('='.repeat(60));
    if (ccOrders > 0 || rsInvoices > 0) {
      console.log('✅ You have automation data stored!');
      console.log(`   - ${ccOrders} CustomerConnect orders`);
      console.log(`   - ${rsInvoices} RouteStar invoices`);
      console.log(`   - ${movements} stock movements`);
      console.log(`   - ${summaries} stock summaries`);

      if (syncedItems === 0 && inventoryCount > 0) {
        console.log('\n⚠️  WARNING: Automation data exists but inventory items');
        console.log('   are not linked (syncMetadata not populated).');
        console.log('   → Need to update inventoryController to enrich sync data');
      }
    } else {
      console.log('❌ No automation data found in database.');
      console.log('   → Need to run sync to fetch from CustomerConnect/RouteStar');
    }
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAutomationData();
