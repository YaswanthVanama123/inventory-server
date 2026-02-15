const CustomerConnectAutomation = require('../automation/customerconnect');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const StockMovement = require('../models/StockMovement');
const SyncLog = require('../models/SyncLog');








let syncLock = false;

class CustomerConnectSyncService {
  constructor() {
    this.automation = null;
    this.syncLog = null;
  }

  


  async init() {
    this.automation = new CustomerConnectAutomation();
    await this.automation.init();
    await this.automation.login();
    return this;
  }

  


  async close() {
    if (this.automation) {
      await this.automation.close();
    }
  }

  


  async createSyncLog(source = 'customerconnect') {
    this.syncLog = await SyncLog.create({
      source,
      status: 'RUNNING',
      startedAt: new Date()
    });
    return this.syncLog;
  }

  


  async updateSyncLog(updates) {
    if (this.syncLog) {
      if (updates.created !== undefined) {
        this.syncLog.recordsInserted = updates.created;
      }
      if (updates.updated !== undefined) {
        this.syncLog.recordsUpdated = updates.updated;
      }
      if (updates.skipped !== undefined || updates.failed !== undefined) {
        this.syncLog.recordsFailed = (updates.skipped || 0) + (updates.failed || 0);
      }
      if (updates.total !== undefined) {
        this.syncLog.recordsFound = updates.total;
      }
      if (updates.error !== undefined) {
        this.syncLog.errorMessage = updates.error;
        this.syncLog.status = 'FAILED';
        this.syncLog.endedAt = new Date();
      }
      if (updates.success === true) {
        this.syncLog.endedAt = new Date();
        this.syncLog.status = this.syncLog.recordsFailed > 0 ? 'PARTIAL' : 'SUCCESS';
      }
      await this.syncLog.save();
    }
  }

  


  mapStatus(status) {
    if (!status) return 'Processing';

    const statusLower = status.toLowerCase().trim();
    const statusMap = {
      'pending': 'Pending',
      'processing': 'Processing',
      'shipped': 'Shipped',
      'complete': 'Complete',
      'completed': 'Complete',
      'cancelled': 'Cancelled',
      'canceled': 'Cancelled',
      'denied': 'Denied',
      'canceled reversal': 'Canceled Reversal',
      'failed': 'Failed',
      'refunded': 'Refunded',
      'reversed': 'Reversed',
      'chargeback': 'Chargeback',
      'expired': 'Expired',
      'voided': 'Voided'
    };

    return statusMap[statusLower] || 'Processing';
  }

  




  async syncOrders(limit = Infinity, forceRefetchDetails = false) {
    if (syncLock) {
      throw new Error('Sync already in progress. Please wait for it to complete.');
    }

    syncLock = true;

    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📦 Syncing CustomerConnect Orders to Database ${fetchAll ? '(ALL)' : `(limit: ${limit})`}${forceRefetchDetails ? ' - FORCE RE-FETCH DETAILS' : ''}`);


    await this.createSyncLog();

    try {
      const result = await this.automation.fetchOrdersList(limit);
      const orders = result.orders;

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors = [];

      for (const order of orders) {
        try {
          if (!order.orderNumber) {
            throw new Error('Missing order number');
          }

          const existing = await CustomerConnectOrder.findByOrderNumber(order.orderNumber);

          const orderData = {
            orderNumber: order.orderNumber,
            poNumber: order.poNumber || '',
            status: this.mapStatus(order.status),
            orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
            vendor: {
              name: order.vendorName || 'Unknown'
            },
            total: parseFloat(order.total?.replace(/[$,]/g, '')) || 0,
            detailUrl: order.detailUrl,
            lastSyncedAt: new Date(),
            rawData: order
          };

          let savedOrder;
          let shouldFetchDetails = false;

          if (existing) {
            
            Object.assign(existing, orderData);
            savedOrder = await existing.save();
            updated++;

            
            if (existing.items && existing.items.length > 0) {
              console.log(`  ⊙ Order #${order.orderNumber} exists with ${existing.items.length} items`);
              
              shouldFetchDetails = forceRefetchDetails;
              if (!forceRefetchDetails) {
                console.log(`     (Skipping detail re-fetch - use forceRefetchDetails=true to update)`);
              }
            } else {
              shouldFetchDetails = true; 
            }
          } else {
            savedOrder = await CustomerConnectOrder.create(orderData);
            created++;
            shouldFetchDetails = true; 
          }

          console.log(`  ✓ Saved order #${order.orderNumber}${existing ? ' (updated)' : ' (new)'}`);

          if (!shouldFetchDetails) {
            continue; 
          }
          if (order.detailUrl) {
            try {
              console.log(`  → Fetching details for #${order.orderNumber}...`);
              const details = await this.automation.fetchOrderDetails(order.detailUrl);

              console.log(`  ✓ Details fetched:`, {
                vendor: details.vendor?.name || 'N/A',
                poNumber: details.poNumber || 'N/A',
                items: details.items?.length || 0
              });

              const freshOrder = await CustomerConnectOrder.findByOrderNumber(order.orderNumber);

              freshOrder.poNumber = details.poNumber || freshOrder.poNumber;
              freshOrder.vendor.name = details.vendor?.name || freshOrder.vendor.name;
              freshOrder.items = details.items.map(item => ({
                sku: item.sku || item.name.toUpperCase(),
                name: item.name,
                qty: item.qty || 0,
                unitPrice: item.unitPrice || 0,
                lineTotal: item.lineTotal || 0
              }));

              freshOrder.subtotal = details.subtotal || 0;
              freshOrder.tax = details.tax || 0;
              freshOrder.shipping = details.shipping || 0;
              freshOrder.total = details.total || freshOrder.total;

              await freshOrder.save();
              console.log(`  ✓ Details saved: ${details.items.length} items`);

              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (detailError) {
              console.error(`  ✗ Failed to fetch details for #${order.orderNumber}:`, detailError.message);
              console.error(`  ✗ Error stack:`, detailError.stack);
            }
          }
        } catch (error) {
          errors.push({
            orderNumber: order.orderNumber || 'UNKNOWN',
            error: error.message,
            rawStatus: order.status
          });
          skipped++;

          if (errors.length <= 5) {
            console.error(`  ✗ Error saving order ${order.orderNumber}: ${error.message}`);
            console.error(`     Raw status: "${order.status}"`);
          }
        }
      }

      await this.updateSyncLog({
        total: orders.length,
        created,
        updated,
        skipped,
        success: true
      });

      console.log(`   ✓ Saved: ${created} new, ${updated} updated${skipped > 0 ? `, ${skipped} failed` : ''}\n`);

      return { synced: created + updated, created, updated, skipped, total: orders.length, errors, pagination: result.pagination };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    } finally {
      syncLock = false;
    }
  }

  


  async syncOrderDetails(orderNumber) {
    try {
      
      const order = await CustomerConnectOrder.findByOrderNumber(orderNumber);
      if (!order) {
        throw new Error(`Order ${orderNumber} not found in database`);
      }

      
      const details = await this.automation.fetchOrderDetails(order.detailUrl);

      
      order.poNumber = details.poNumber || order.poNumber;
      order.items = details.items.map(item => ({
        sku: item.sku || item.name.toUpperCase(),
        name: item.name,
        qty: item.qty || 0,
        unitPrice: item.unitPrice || 0,
        lineTotal: item.lineTotal || 0
      }));

      order.subtotal = details.subtotal || 0;
      order.tax = details.tax || 0;
      order.shipping = details.shipping || 0;
      order.total = details.total || 0;

      await order.save();

      console.log(`✓ Order details saved for #${orderNumber}`);
      return order;
    } catch (error) {
      console.error(`✗ Error syncing order details: ${error.message}`);
      throw error;
    }
  }

  



  async syncAllOrderDetails(limit = Infinity) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Syncing missing order details${fetchAll ? ' (ALL)' : ` (limit: ${limit})`}...`);

    await this.createSyncLog();

    try {
      
      const query = CustomerConnectOrder.find({
        $or: [
          { items: { $exists: false } },
          { items: { $size: 0 } }
        ]
      }).sort({ orderDate: -1 });

      
      const ordersWithoutDetails = fetchAll ? await query : await query.limit(limit);

      console.log(`   Found: ${ordersWithoutDetails.length} orders needing details`);

      let synced = 0;
      let skipped = 0;
      const errors = [];

      for (const order of ordersWithoutDetails) {
        try {
          if (!order.detailUrl) {
            skipped++;
            continue;
          }

          await this.syncOrderDetails(order.orderNumber);
          synced++;

          
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          errors.push({
            orderNumber: order.orderNumber,
            error: error.message
          });
          skipped++;
        }
      }

      await this.updateSyncLog({
        total: ordersWithoutDetails.length,
        created: synced,
        skipped,
        success: true
      });

      console.log(`   ✓ Details Synced: ${synced}${skipped > 0 ? `, ${skipped} skipped` : ''}\n`);

      return { synced, skipped, total: ordersWithoutDetails.length, errors };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    }
  }

  



  async processStockMovements() {
    console.log(`\n📦 Processing stock movements for completed orders...`);

    await this.createSyncLog();

    try {
      
      const orders = await CustomerConnectOrder.getUnprocessedOrders();
      console.log(`✓ Found ${orders.length} unprocessed orders`);

      let processed = 0;
      let skipped = 0;
      const errors = [];

      for (const order of orders) {
        try {
          
          if (!order.items || order.items.length === 0) {
            console.log(`  ⊗ Skipped #${order.orderNumber}: No line items`);
            skipped++;
            continue;
          }

          
          for (const item of order.items) {
            if (item.qty <= 0) continue;

            
            await StockMovement.create({
              sku: item.sku,
              type: 'IN',
              qty: item.qty,
              refType: 'PURCHASE_ORDER',
              refId: order._id,
              sourceRef: order.orderNumber,
              timestamp: order.orderDate || new Date(),
              notes: `Purchase: ${order.vendor.name} - Order #${order.orderNumber}${order.poNumber ? ` (PO: ${order.poNumber})` : ''}`
            });

            console.log(`  ✓ Stock movement created for ${item.sku}: +${item.qty}`);
          }


          await order.markStockProcessed();
          processed++;
          console.log(`  ✓ Processed: #${order.orderNumber} (${order.items.length} items)`);
        } catch (error) {
          errors.push({
            orderNumber: order.orderNumber,
            error: error.message
          });
          await order.markStockProcessed(error);
          skipped++;
          console.error(`  ✗ Error processing #${order.orderNumber}: ${error.message}`);
        }
      }

      await this.updateSyncLog({
        total: orders.length,
        created: processed,
        skipped,
        success: true
      });

      console.log(`\n✓ Stock movements completed:`);
      console.log(`  - Processed: ${processed}`);
      console.log(`  - Skipped: ${skipped}`);
      console.log(`  - Total: ${orders.length}`);

      return { processed, skipped, total: orders.length, errors };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    }
  }

  







  async fullSync(options = {}) {
    const {
      ordersLimit = Infinity,
      detailsLimit = Infinity,
      forceRefetchDetails = false,
      processStock = true
    } = options;

    console.log('\n🔄 Starting full CustomerConnect sync...');
    console.log('===================================');

    const results = {
      orders: null,
      details: null,
      stock: null
    };

    try {
      
      results.orders = await this.syncOrders(ordersLimit, forceRefetchDetails);

      
      results.details = await this.syncAllOrderDetails(detailsLimit);

      
      if (processStock) {
        results.stock = await this.processStockMovements();
      }

      console.log('\n✅ Full sync completed successfully!');
      console.log('===================================\n');

      return results;
    } catch (error) {
      console.error(`\n❌ Full sync failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = CustomerConnectSyncService;
