const ItemCaseQuantity = require('../models/ItemCaseQuantity');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const ModelCategory = require('../models/ModelCategory');

const LOOKUP_CACHE_TTL_MS = 30 * 1000;

/**
 * Case-quantity (pack size) mappings for purchased items.
 *
 * Two responsibilities:
 *  1. The lookup map used by every stock calculation to convert a purchase
 *     quantity (cases) into selling units. Cached briefly because the stock
 *     aggregations call it on every request.
 *  2. The data behind the Case Quantity Mapping screen: every unique SKU that
 *     has ever appeared on a purchase order, with its current pack size.
 */
class ItemCaseQuantityService {
  constructor() {
    this._lookupCache = null;
    this._lookupCacheExpiry = 0;
  }

  invalidateCache() {
    this._lookupCache = null;
    this._lookupCacheExpiry = 0;
  }

  /**
   * { [SKU]: unitsPerCase }. Missing SKUs mean "1 unit per purchase unit".
   */
  async getLookupMap() {
    if (this._lookupCache && Date.now() < this._lookupCacheExpiry) {
      return this._lookupCache;
    }
    const lookup = await ItemCaseQuantity.buildLookupMap();
    this._lookupCache = lookup;
    this._lookupCacheExpiry = Date.now() + LOOKUP_CACHE_TTL_MS;
    return lookup;
  }

  /** Units contained in one purchase unit of `sku`. Always >= 1. */
  unitsPerCase(lookup, sku) {
    if (!sku || !lookup) return 1;
    const factor = lookup[String(sku).toUpperCase()];
    return factor > 0 ? factor : 1;
  }

  /** Convert a purchase-order quantity (cases) into selling units. */
  toUnits(lookup, sku, qty) {
    return (qty || 0) * this.unitsPerCase(lookup, sku);
  }

  /**
   * Every unique SKU that appears on a purchase order (CustomerConnect or
   * manual), plus manual PO catalog items that have not been ordered yet.
   *
   * `countedQty` mirrors the rule the stock aggregations use - the received
   * quantity when a partial receipt was recorded, otherwise the full ordered
   * quantity once the line is verified - so this screen shows the same numbers
   * that Stock will multiply by the case quantity.
   */
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

    // Manual PO catalog items that have never been ordered still need a pack
    // size, otherwise their first order lands in stock un-converted.
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
      return {
        sku: entry.sku,
        itemName: entry.itemName || mapping?.itemName || '',
        source: sources.length > 1 ? 'both' : sources[0],
        categoryItemName: categoryBySku.get(entry.sku) || null,
        isMapped,
        unitsPerCase,
        purchaseUnitLabel: mapping?.purchaseUnitLabel || 'Case',
        sellingUnitLabel: mapping?.sellingUnitLabel || 'Each',
        notes: mapping?.notes || '',
        orderCount: entry.orderCount,
        lastOrderDate: entry.lastOrderDate,
        lastUnitPrice: entry.lastUnitPrice,
        // Quantities as recorded on the orders (purchase units / cases)
        orderedCases: entry.orderedQty,
        countedCases: entry.countedQty,
        // The same quantities converted to selling units
        orderedUnits: entry.orderedQty * unitsPerCase,
        countedUnits: entry.countedQty * unitsPerCase
      };
    });

    result.sort((a, b) => a.sku.localeCompare(b.sku));

    // ----- Filtering / stats / pagination (server-side, like Model Mapping) -----
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

    // Stats always cover the full (unfiltered) set.
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
