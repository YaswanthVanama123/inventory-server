





const User = require('../models/User');
const Inventory = require('../models/Inventory');
const Invoice = require('../models/Invoice');
const Purchase = require('../models/Purchase');
const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const PaymentType = require('../models/PaymentType');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const SyncLog = require('../models/SyncLog');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const ExternalInvoice = require('../models/ExternalInvoice');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarItem = require('../models/RouteStarItem');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const ModelCategory = require('../models/ModelCategory');





async function initModels() {
  console.log('Initializing models and creating indexes...');

  const models = [
    { name: 'User', model: User },
    { name: 'Inventory', model: Inventory },
    { name: 'Invoice', model: Invoice },
    { name: 'Purchase', model: Purchase },
    { name: 'PurchaseOrder', model: PurchaseOrder },
    { name: 'Product', model: Product },
    { name: 'Coupon', model: Coupon },
    { name: 'PaymentType', model: PaymentType },
    { name: 'Settings', model: Settings },
    { name: 'AuditLog', model: AuditLog },
    { name: 'StockMovement', model: StockMovement },
    { name: 'StockSummary', model: StockSummary },
    { name: 'SyncLog', model: SyncLog },
    { name: 'CustomerConnectOrder', model: CustomerConnectOrder },
    { name: 'ExternalInvoice', model: ExternalInvoice },
    { name: 'RouteStarInvoice', model: RouteStarInvoice },
    { name: 'RouteStarItem', model: RouteStarItem },
    { name: 'RouteStarItemAlias', model: RouteStarItemAlias },
    { name: 'ModelCategory', model: ModelCategory }
  ];

  try {
    const indexPromises = models.map(async ({ name, model }) => {
      try {
        await model.createIndexes();
        const indexCount = model.schema.indexes().length;
        console.log(`  ✓ ${name}: Created ${indexCount} indexes`);
        return { name, success: true, indexCount };
      } catch (error) {
        console.error(`  ✗ ${name}: Failed to create indexes - ${error.message}`);
        return { name, success: false, error: error.message };
      }
    });

    const results = await Promise.all(indexPromises);

    const successCount = results.filter(r => r.success).length;
    const totalIndexes = results.reduce((sum, r) => sum + (r.indexCount || 0), 0);

    console.log(`\n✅ Models initialized: ${successCount}/${models.length} successful`);
    console.log(`   Total indexes created: ${totalIndexes}`);

    return results;
  } catch (error) {
    console.error('❌ Failed to initialize models:', error);
    throw error;
  }
}

module.exports = initModels;
