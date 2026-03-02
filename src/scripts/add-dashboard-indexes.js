const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const AuditLog = require('../models/AuditLog');
const SyncLog = require('../models/SyncLog');

async function addDashboardIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory-db');
    
    console.log('Adding indexes for dashboard optimization...');

    // Inventory indexes
    await Inventory.collection.createIndex({ isActive: 1, isDeleted: 1 });
    await Inventory.collection.createIndex({ category: 1, isActive: 1 });
    await Inventory.collection.createIndex({ 'quantity.current': 1 });
    
    // RouteStarInvoice indexes
    await RouteStarInvoice.collection.createIndex({ status: 1, invoiceDate: -1 });
    await RouteStarInvoice.collection.createIndex({ invoiceDate: -1 });
    
    // CustomerConnectOrder indexes
    await CustomerConnectOrder.collection.createIndex({ status: 1, orderDate: -1 });
    await CustomerConnectOrder.collection.createIndex({ orderDate: -1 });
    
    // AuditLog indexes
    await AuditLog.collection.createIndex({ resource: 1, timestamp: -1 });
    await AuditLog.collection.createIndex({ timestamp: -1 });
    
    // SyncLog indexes
    await SyncLog.collection.createIndex({ startedAt: -1 });
    await SyncLog.collection.createIndex({ status: 1, startedAt: -1 });

    console.log('✓ All indexes created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error creating indexes:', error);
    process.exit(1);
  }
}

addDashboardIndexes();
