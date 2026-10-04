require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const ModelCategory = require('../models/ModelCategory');
const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const PurchaseOrder = require('../models/PurchaseOrder');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');

const run = async () => {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const toUpperSet = (values) => new Set(values.filter(Boolean).map((v) => String(v).toUpperCase()));
  const [mappings, catalogSkus, manualOrderSkus, customerConnectSkus] = await Promise.all([
    ModelCategory.find().select('modelNumber categoryItemName').lean(),
    ManualPurchaseOrderItem.distinct('sku'),
    PurchaseOrder.distinct('items.sku', { source: 'manual' }),
    CustomerConnectOrder.distinct('items.sku'),
  ]);
  const catalog = toUpperSet(catalogSkus);
  const manualOrdered = toUpperSet(manualOrderSkus);
  const customerConnect = toUpperSet(customerConnectSkus);

  const orphans = mappings.filter((m) => {
    const sku = String(m.modelNumber || '').toUpperCase();
    const wasManualItem = manualOrdered.has(sku) || /^CUSTOM-\d+$/.test(sku);
    return sku && wasManualItem && !catalog.has(sku) && !customerConnect.has(sku);
  });

  if (orphans.length === 0) {
    console.log('No mappings left behind by deleted Manual PO items.');
    return;
  }

  console.log(`${orphans.length} mapping(s) left behind by deleted Manual PO items:`);
  orphans.forEach((m) => console.log(`  ${m.modelNumber}  ->  ${m.categoryItemName}`));

  if (!apply) {
    console.log('\nDry run - nothing deleted. Re-run with --apply to delete these mappings.');
    return;
  }

  const result = await ModelCategory.deleteMany({ _id: { $in: orphans.map((m) => m._id) } });
  console.log(`\nDeleted ${result.deletedCount} mapping(s). Stock no longer counts those items' purchases under the RouteStar items.`);
};

run()
  .catch((error) => {
    console.error('Cleanup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
