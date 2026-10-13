require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const PurchaseOrder = require('../models/PurchaseOrder');
const ModelCategory = require('../models/ModelCategory');
const ItemCaseQuantity = require('../models/ItemCaseQuantity');
const dataPurgeService = require('../services/dataPurge.service');

const run = async () => {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const upper = (values) => values.filter(Boolean).map((v) => String(v).toUpperCase());
  const isCustom = (sku) => /^CUSTOM-\d+$/.test(sku);
  const [catalogSkus, orderSkus, mappingSkus, caseSkus] = await Promise.all([
    ManualPurchaseOrderItem.distinct('sku'),
    PurchaseOrder.distinct('items.sku', { source: 'manual' }),
    ModelCategory.distinct('modelNumber'),
    ItemCaseQuantity.distinct('sku'),
  ]);
  const catalog = new Set(upper(catalogSkus));
  const candidates = new Set([...upper(orderSkus), ...upper(mappingSkus).filter(isCustom), ...upper(caseSkus).filter(isCustom)]);
  const leftovers = [...candidates].filter((sku) => !catalog.has(sku)).sort();

  if (leftovers.length === 0) {
    console.log('Nothing left behind by deleted Manual PO items.');
    return;
  }

  const counts = await PurchaseOrder.aggregate([
    { $match: { source: 'manual', 'items.sku': { $in: leftovers } } },
    { $unwind: '$items' },
    { $match: { 'items.sku': { $in: leftovers } } },
    { $group: { _id: '$items.sku', orders: { $addToSet: '$_id' } } },
  ]);
  const ordersBySku = new Map(counts.map((c) => [c._id, c.orders.length]));
  console.log(`${leftovers.length} SKU(s) of deleted Manual PO items still have data:`);
  leftovers.forEach((sku) => console.log(`  ${sku}  (on ${ordersBySku.get(sku) || 0} manual order(s))`));

  if (!apply) {
    console.log('\nDry run - nothing deleted. Re-run with --apply to remove these items from manual orders (empty orders are deleted) along with their stock history, discrepancies, case quantities and RouteStar mappings.');
    return;
  }

  const result = await dataPurgeService.cascadeManualPOItems(leftovers);
  console.log('\nRemoved:', JSON.stringify(result));
};

run()
  .catch((error) => {
    console.error('Cleanup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
