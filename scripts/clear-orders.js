require('dotenv').config();
const mongoose = require('mongoose');

/**
 * Clear all CustomerConnect orders from database
 * Run this to delete old data before testing the fixed scraper
 */

async function clearOrders() {
  try {
    console.log('🗑️  Connecting to MongoDB...\n');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const CustomerConnectOrder = require('./src/models/CustomerConnectOrder');

    // Count current orders
    const count = await CustomerConnectOrder.countDocuments();
    console.log(`📊 Current orders in database: ${count}\n`);

    if (count === 0) {
      console.log('✅ No orders to delete. Database is already clean.\n');
      process.exit(0);
    }

    // Ask for confirmation
    console.log('⚠️  WARNING: This will delete ALL CustomerConnect orders!');
    console.log('   You will need to re-sync from CustomerConnect portal.\n');

    // Delete all orders
    const result = await CustomerConnectOrder.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} orders\n`);

    // Verify deletion
    const remaining = await CustomerConnectOrder.countDocuments();
    console.log(`📊 Remaining orders: ${remaining}\n`);

    if (remaining === 0) {
      console.log('🎉 All orders deleted successfully!');
      console.log('\n📝 Next steps:');
      console.log('   1. Restart backend: npm start');
      console.log('   2. Go to http://localhost:5173/orders');
      console.log('   3. Click "Sync Orders" button');
      console.log('   4. Check if vendor names, dates, totals are populated!\n');
    } else {
      console.log('⚠️  Some orders remain. Please check manually.\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearOrders();
