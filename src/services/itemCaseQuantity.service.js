const ItemCaseQuantity = require('../models/ItemCaseQuantity');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const ModelCategory = require('../models/ModelCategory');

const LOOKUP_CACHE_TTL_MS = 30 * 1000;

const PURCHASE_UNIT_LABELS = {
  CASE: 'Case', CS: 'Case',
  PACK: 'Pack', PK: 'Pack', PKG: 'Pack',
  BOX: 'Box', BX: 'Box',
  CARTON: 'Carton', CTN: 'Carton',
  BAG: 'Bag',
  ROLL: 'Roll', RL: 'Roll',
  DOZEN: 'Dozen', DZ: 'Dozen',
  BUNDLE: 'Bundle', BDL: 'Bundle',
  SLEEVE: 'Sleeve', SLV: 'Sleeve',
  PAIR: 'Pair', PAIRS: 'Pair', PR: 'Pair', PRS: 'Pair',
  PAIL: 'Pail', DRUM: 'Drum', TUB: 'Tub', JUG: 'Jug',
  REAM: 'Ream', SET: 'Set', KIT: 'Kit',
  EACH: 'Each', EA: 'Each'
};
const UNIT = `(${Object.keys(PURCHASE_UNIT_LABELS).join('|')})`;
const PACK_SPEC_FORMS = [
  `${UNIT}\\s*(?:/|\\bOF\\b)\\s*\\d+`,
  `\\d+\\s*(?:/|\\bPER\\b)\\s*${UNIT}`,
  `(?:\\d+\\s*)?${UNIT}\\s*(?:/|\\bPER\\b)\\s*${UNIT}`
];
const PACK_SPEC_RE = new RegExp(`\\b(?:${PACK_SPEC_FORMS.join('|')})\\b`, 'gi');
const PAIR_MENTION_RE = /\b(?:PAIRS?|\d+\s*PRS?)\b/i;

class ItemCaseQuantityService {
  constructor() {
    this._lookupCache = null;
    this._lookupCacheExpiry = 0;
  }

  invalidateCache() {
    this._lookupCache = null;
    this._lookupCacheExpiry = 0;
  }

  async getLookupMap() {
    if (this._lookupCache && Date.now() < this._lookupCacheExpiry) {
      return this._lookupCache;
    }
    const lookup = await ItemCaseQuantity.buildLookupMap();
    this._lookupCache = lookup;
    this._lookupCacheExpiry = Date.now() + LOOKUP_CACHE_TTL_MS;
    return lookup;
  }

  unitsPerCase(lookup, sku) {
    if (!sku || !lookup) return 1;
    const factor = lookup[String(sku).toUpperCase()];
    return factor > 0 ? factor : 1;
  }

  toUnits(lookup, sku, qty) {
    return (qty || 0) * this.unitsPerCase(lookup, sku);
  }

  purchaseUnitFromName(itemName) {
    if (!itemName) return null;
    const name = String(itemName);
    let label = null;
    for (const match of name.matchAll(PACK_SPEC_RE)) {
      label = PURCHASE_UNIT_LABELS[(match[1] || match[2] || match[4]).toUpperCase()];
    }
    if (!label && PAIR_MENTION_RE.test(name)) label = 'Pair';
    return label;
  }

  async getPurchasedItems(options = {}) {
    const [ccItems, manualOrderItems, manualCatalogItems, mappings, categoryMappings] =
      await Promise.all([
        CustomerConnectOrder.aggregate([
          { $unwind: '$items' },
          {
            $group: {
              _id: { $toUpper: '$items.sku' },
              itemName: { $first: '$items.name' },
              orderedQty: { $sum: { $ifNull: ['$items.qty', 0] } },
              countedQty: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ifNull: ['$items.receivedQuantity', false] },
                        { $gt: ['$items.receivedQuantity', 0] }
                      ]
                    },
                    '$items.receivedQuantity',
                    { $cond: [{ $eq: ['$items.itemVerified', true] }, '$items.qty', 0] }
                  ]
                }
              },
              orderCount: { $sum: 1 },
              lastOrderDate: { $max: '$orderDate' },
              lastUnitPrice: { $last: '$items.unitPrice' }
            }
          }
        ]).allowDiskUse(true),
        PurchaseOrder.aggregate([
          { $match: { source: 'manual' } },
          { $unwind: '$items' },
          {
            $group: {
              _id: { $toUpper: '$items.sku' },
              itemName: { $first: '$items.name' },
              orderedQty: { $sum: { $ifNull: ['$items.qty', 0] } },
              countedQty: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ifNull: ['$items.receivedQuantity', false] },
                        { $gt: ['$items.receivedQuantity', 0] }
                      ]
                    },
                    '$items.receivedQuantity',
                    { $cond: [{ $eq: ['$items.itemVerified', true] }, '$items.qty', 0] }
                  ]
                }
              },
              orderCount: { $sum: 1 },
              lastOrderDate: { $max: '$orderDate' },
              lastUnitPrice: { $last: '$items.unitPrice' }
            }
          }
        ]).allowDiskUse(true),
        ManualPurchaseOrderItem.find({ isActive: true })
          .select('sku name mappedCategoryItemName')
          .lean(),
        ItemCaseQuantity.find().lean(),
        ModelCategory.find().select('modelNumber categoryItemName').lean()
      ]);

    const itemsMap = new Map();

    const addSource = (rows, source) => {
      rows.forEach(row => {
        const sku = (row._id || '').toUpperCase();
        if (!sku) return;
        const existing = itemsMap.get(sku);
        if (existing) {
          existing.orderedQty += row.orderedQty || 0;
          existing.countedQty += row.countedQty || 0;
          existing.orderCount += row.orderCount || 0;
          existing.itemName = existing.itemName || row.itemName || '';
          existing.sources.add(source);
          if (row.lastOrderDate && (!existing.lastOrderDate || row.lastOrderDate > existing.lastOrderDate)) {
            existing.lastOrderDate = row.lastOrderDate;
            existing.lastUnitPrice = row.lastUnitPrice || existing.lastUnitPrice;
          }
        } else {
          itemsMap.set(sku, {
            sku,
            itemName: row.itemName || '',
            orderedQty: row.orderedQty || 0,
            countedQty: row.countedQty || 0,
            orderCount: row.orderCount || 0,
            lastOrderDate: row.lastOrderDate || null,
            lastUnitPrice: row.lastUnitPrice || 0,
            sources: new Set([source])
          });
        }
      });
    };

    addSource(ccItems, 'customerconnect');
    addSource(manualOrderItems, 'manual');

    manualCatalogItems.forEach(item => {
      const sku = (item.sku || '').toUpperCase();
      if (!sku) return;
      if (itemsMap.has(sku)) {
        itemsMap.get(sku).sources.add('manual');
        return;
      }
      itemsMap.set(sku, {
        sku,
        itemName: item.name || '',
        orderedQty: 0,
        countedQty: 0,
        orderCount: 0,
        lastOrderDate: null,
        lastUnitPrice: 0,
        sources: new Set(['manual'])
      });
    });

    const mappingBySku = new Map();
    mappings.forEach(m => mappingBySku.set((m.sku || '').toUpperCase(), m));

    const categoryBySku = new Map();
    categoryMappings.forEach(m => {
      if (m.modelNumber && m.categoryItemName) {
        categoryBySku.set(m.modelNumber.toUpperCase(), m.categoryItemName);
      }
    });
    manualCatalogItems.forEach(item => {
      const sku = (item.sku || '').toUpperCase();
      if (sku && item.mappedCategoryItemName && !categoryBySku.has(sku)) {
        categoryBySku.set(sku, item.mappedCategoryItemName);
      }
    });

    const result = Array.from(itemsMap.values()).map(entry => {
      const mapping = mappingBySku.get(entry.sku);
      const isMapped = Boolean(mapping && mapping.isActive !== false);
      const unitsPerCase = isMapped && mapping.unitsPerCase > 0 ? mapping.unitsPerCase : 1;
      const sources = Array.from(entry.sources);
      const itemName = entry.itemName || mapping?.itemName || '';
      return {
        sku: entry.sku,
        itemName,
        source: sources.length > 1 ? 'both' : sources[0],
        categoryItemName: categoryBySku.get(entry.sku) || null,
        isMapped,
        unitsPerCase,
        purchaseUnitLabel: mapping?.purchaseUnitLabel || this.purchaseUnitFromName(itemName) || 'Case',
        sellingUnitLabel: mapping?.sellingUnitLabel || 'Each',
        notes: mapping?.notes || '',
        orderCount: entry.orderCount,
        lastOrderDate: entry.lastOrderDate,
        lastUnitPrice: entry.lastUnitPrice,
        orderedCases: entry.orderedQty,
        countedCases: entry.countedQty,
        orderedUnits: entry.orderedQty * unitsPerCase,
        countedUnits: entry.countedQty * unitsPerCase
      };
    });

    result.sort((a, b) => a.sku.localeCompare(b.sku));

    const { search, status } = options;
    let filtered = result;

    if (search && String(search).trim()) {
      const term = String(search).toLowerCase().trim();
      filtered = filtered.filter(item =>
        (item.sku || '').toLowerCase().includes(term) ||
        (item.itemName || '').toLowerCase().includes(term) ||
        (item.categoryItemName || '').toLowerCase().includes(term)
      );
    }

    if (status === 'mapped') {
      filtered = filtered.filter(item => item.isMapped);
    } else if (status === 'unmapped') {
      filtered = filtered.filter(item => !item.isMapped);
    } else if (status === 'bulk') {
      filtered = filtered.filter(item => item.unitsPerCase > 1);
    }

    const mappedCount = result.filter(item => item.isMapped).length;
    const bulkCount = result.filter(item => item.unitsPerCase > 1).length;
    const stats = {
      total: result.length,
      mapped: mappedCount,
      unmapped: result.length - mappedCount,
      bulk: bulkCount
    };

    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.max(1, parseInt(options.limit, 10) || 20);
    const filteredTotal = filtered.length;
    const totalPages = Math.max(1, Math.ceil(filteredTotal / limit));
    const start = (page - 1) * limit;

    return {
      items: filtered.slice(start, start + limit),
      stats,
      pagination: {
        total: filteredTotal,
        page,
        limit,
        totalPages
      },
      total: filteredTotal
    };
  }

  async saveMapping(data, userId) {
    const { sku } = data;
    if (!sku) {
      throw new Error('SKU is required');
    }
    const unitsPerCase = Number(data.unitsPerCase);
    if (!Number.isFinite(unitsPerCase) || unitsPerCase < 1) {
      throw new Error('Units per case must be a number greater than or equal to 1');
    }
    const mapping = await ItemCaseQuantity.upsertMapping(
      sku,
      {
        itemName: data.itemName,
        unitsPerCase,
        purchaseUnitLabel: data.purchaseUnitLabel,
        sellingUnitLabel: data.sellingUnitLabel,
        notes: data.notes
      },
      userId
    );
    this.invalidateCache();
    return mapping;
  }

  async bulkSaveMappings(items, userId) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No mappings supplied');
    }
    const saved = [];
    const failed = [];
    for (const item of items) {
      try {
        saved.push(await this.saveMapping(item, userId));
      } catch (error) {
        failed.push({ sku: item?.sku, message: error.message });
      }
    }
    this.invalidateCache();
    return { saved: saved.length, failed };
  }

  async deleteMapping(sku) {
    if (!sku) {
      throw new Error('SKU is required');
    }
    const result = await ItemCaseQuantity.findOneAndDelete({ sku: sku.toUpperCase() });
    if (!result) {
      throw new Error('Mapping not found');
    }
    this.invalidateCache();
    return result;
  }

  async getAllMappings(search) {
    const query = {};
    if (search && String(search).trim()) {
      const term = String(search).trim();
      query.$or = [
        { sku: { $regex: term, $options: 'i' } },
        { itemName: { $regex: term, $options: 'i' } }
      ];
    }
    const mappings = await ItemCaseQuantity.find(query).sort({ sku: 1 }).lean();
    return { mappings, total: mappings.length };
  }
}

module.exports = new ItemCaseQuantityService();
