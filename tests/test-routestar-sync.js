











const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });


const mongoose = require('mongoose');


const RouteStarSyncService = require('../src/services/routeStarSync.service');
const RouteStarInvoice = require('../src/models/RouteStarInvoice');




async function connectDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✓ MongoDB connected\n');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
}




function displayStats(results) {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║       SYNC STATISTICS SUMMARY          ║');
  console.log('╠════════════════════════════════════════╣');

  if (results.pending) {
    console.log('║ PENDING INVOICES:                      ║');
    console.log(`║   Created:  ${String(results.pending.created).padStart(4)} invoices           ║`);
    console.log(`║   Updated:  ${String(results.pending.updated).padStart(4)} invoices           ║`);
    console.log(`║   Skipped:  ${String(results.pending.skipped).padStart(4)} invoices           ║`);
    console.log(`║   Total:    ${String(results.pending.total).padStart(4)} invoices           ║`);
    console.log('╠════════════════════════════════════════╣');
  }

  if (results.closed) {
    console.log('║ CLOSED INVOICES:                       ║');
    console.log(`║   Created:  ${String(results.closed.created).padStart(4)} invoices           ║`);
    console.log(`║   Updated:  ${String(results.closed.updated).padStart(4)} invoices           ║`);
    console.log(`║   Skipped:  ${String(results.closed.skipped).padStart(4)} invoices           ║`);
    console.log(`║   Total:    ${String(results.closed.total).padStart(4)} invoices           ║`);
    console.log('╠════════════════════════════════════════╣');
  }

  if (results.stock) {
    console.log('║ STOCK MOVEMENTS:                       ║');
    console.log(`║   Processed: ${String(results.stock.processed).padStart(3)} invoices           ║`);
    console.log(`║   Skipped:   ${String(results.stock.skipped).padStart(3)} invoices           ║`);
    console.log(`║   Total:     ${String(results.stock.total).padStart(3)} invoices           ║`);
  }

  console.log('╚════════════════════════════════════════╝\n');
}




async function displayInvoiceSummary() {
  console.log('\n📊 DATABASE INVOICE SUMMARY');
  console.log('═══════════════════════════════════════');

  
  const pendingCount = await RouteStarInvoice.countDocuments({ invoiceType: 'pending' });
  const closedCount = await RouteStarInvoice.countDocuments({ invoiceType: 'closed' });

  console.log(`\n📋 Invoice Types:`);
  console.log(`  - Pending: ${pendingCount}`);
  console.log(`  - Closed:  ${closedCount}`);
  console.log(`  - Total:   ${pendingCount + closedCount}`);

  
  const statusCounts = await RouteStarInvoice.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  console.log(`\n📊 Status Breakdown:`);
  statusCounts.forEach(item => {
    console.log(`  - ${item._id}: ${item.count}`);
  });

  
  const stockProcessed = await RouteStarInvoice.countDocuments({ stockProcessed: true });
  const stockUnprocessed = await RouteStarInvoice.countDocuments({ stockProcessed: false });

  console.log(`\n📦 Stock Processing Status:`);
  console.log(`  - Processed:   ${stockProcessed}`);
  console.log(`  - Unprocessed: ${stockUnprocessed}`);

  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const salesStats = await RouteStarInvoice.getSalesStats(thirtyDaysAgo, new Date());

  console.log(`\n💰 Sales Stats (Last 30 Days):`);
  console.log(`  - Total Sales:    $${salesStats.totalSales.toFixed(2)}`);
  console.log(`  - Total Invoices: ${salesStats.totalInvoices}`);
  console.log(`  - Average Value:  $${salesStats.averageInvoiceValue.toFixed(2)}`);

  
  const topCustomers = await RouteStarInvoice.getTopCustomers(thirtyDaysAgo, new Date(), 5);

  console.log(`\n👥 Top 5 Customers (Last 30 Days):`);
  topCustomers.forEach((customer, index) => {
    console.log(`  ${index + 1}. ${customer._id}`);
    console.log(`     Sales: $${customer.totalSales.toFixed(2)} (${customer.invoiceCount} invoices)`);
  });

  console.log('\n═══════════════════════════════════════\n');
}




async function test() {
  let syncService = null;

  try {
    console.log('════════════════════════════════════════');
    console.log('  RouteStar Sync Service Test');
    console.log('════════════════════════════════════════\n');

    
    await connectDatabase();

    
    console.log('Initializing RouteStar sync service...');
    syncService = new RouteStarSyncService();
    await syncService.init();
    console.log('✓ Sync service initialized\n');

    
    const results = await syncService.fullSync({
      pendingLimit: 50,    
      closedLimit: 50,     
      processStock: true   
    });

    
    displayStats(results);

    
    await displayInvoiceSummary();

    console.log('✅ TEST COMPLETED SUCCESSFULLY\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    
    if (syncService) {
      console.log('\nClosing RouteStar automation...');
      await syncService.close();
      console.log('✓ Automation closed');
    }

    
    console.log('Closing database connection...');
    await mongoose.connection.close();
    console.log('✓ Database closed\n');
  }
}


test();
