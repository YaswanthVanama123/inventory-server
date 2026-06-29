const RouteStarItem = require('../models/RouteStarItem');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const RouteStarSyncService = require('./routeStarSync.service');
const ModelCategory = require('../models/ModelCategory');

// Escape regex metacharacters so a search term (e.g. an item/canonical name with
// "(", "+", "/", "," etc.) is matched LITERALLY. Without this, `new RegExp(search)`
// either throws (unbalanced "(" / "[") or silently mismatches.
const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


class RouteStarItemsService {
  async getItemStats() {
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    const mappedCategories = await ModelCategory.distinct('categoryItemName');
    const mappedCategorySet = new Set(mappedCategories.map(name => name?.toLowerCase()).filter(Boolean));
    const allItems = await RouteStarItem.find().lean();
    const groupedByCanonical = {};
    allItems.forEach(item => {
      const canonicalName = aliasMap[item.itemName.toLowerCase()] || item.itemName;
      if (!groupedByCanonical[canonicalName]) {
        groupedByCanonical[canonicalName] = {
          forUse: false,
          forSell: false,
          isMapped: mappedCategorySet.has(canonicalName.toLowerCase())
        };
      }
      if (item.forUse) groupedByCanonical[canonicalName].forUse = true;
      if (item.forSell) groupedByCanonical[canonicalName].forSell = true;
    });
    const mergedItems = Object.values(groupedByCanonical);
    const total = mergedItems.length;
    const forUseCount = mergedItems.filter(item => item.forUse).length;
    const forSellCount = mergedItems.filter(item => item.forSell).length;
    const bothCount = mergedItems.filter(item => item.forUse && item.forSell).length;
    const unmarkedCount = mergedItems.filter(item => !item.forUse && !item.forSell).length;
    return {
      total,
      forUse: forUseCount,
      forSell: forSellCount,
      both: bothCount,
      unmarked: unmarkedCount
    };
  }
  async getItems(filters = {}, pagination = {}) {
    const {
      search,
      itemParent,
      type,
      itemCategory,
      forUse,
      forSell
    } = filters;
    const {
      page = 1,
      limit = 50,
      sortBy = 'itemName',
      sortOrder = 'asc'
    } = pagination;
    const query = {};
    if (itemParent && itemParent !== 'all') {
      query.itemParent = itemParent;
    }
    if (type && type !== 'all') {
      query.type = type;
    }
    if (forUse === 'true') {
      query.forUse = true;
    }
    if (forSell === 'true') {
      query.forSell = true;
    }
    if (itemCategory && itemCategory !== 'all') {
      query.itemCategory = itemCategory;
    }
    const allItems = await RouteStarItem.find(query)
      .sort({ itemName: sortOrder === 'asc' ? 1 : -1 })
      .lean();
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    const mappedCategories = await ModelCategory.distinct('categoryItemName');
    const mappedCategorySet = new Set(mappedCategories.map(name => name?.toLowerCase()).filter(Boolean));
    const groupedByCanonical = {};
    allItems.forEach(item => {
      const canonicalName = aliasMap[item.itemName.toLowerCase()] || item.itemName;
      if (!groupedByCanonical[canonicalName]) {
        groupedByCanonical[canonicalName] = {
          _id: item._id,
          itemName: canonicalName,
          itemParent: item.itemParent,
          description: item.description,
          itemCategory: item.itemCategory,
          qtyOnHand: 0,
          forUse: item.forUse,
          forSell: item.forSell,
          type: item.type,
          isMapped: mappedCategorySet.has(canonicalName.toLowerCase()),
          mergedCount: 0,
          variations: []
        };
      }
      groupedByCanonical[canonicalName].qtyOnHand += (item.qtyOnHand || 0);
      groupedByCanonical[canonicalName].mergedCount++;
      groupedByCanonical[canonicalName].variations.push(item.itemName);
      if (item.forUse) groupedByCanonical[canonicalName].forUse = true;
      if (item.forSell) groupedByCanonical[canonicalName].forSell = true;
    });
    let mergedItems = Object.values(groupedByCanonical);
    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      mergedItems = mergedItems.filter(item => {
        return searchRegex.test(item.itemName) ||
               searchRegex.test(item.itemParent || '') ||
               searchRegex.test(item.description || '') ||
               item.variations.some(variation => searchRegex.test(variation));
      });
    }
    const total = mergedItems.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedItems = mergedItems.slice(skip, skip + parseInt(limit));
    const itemParents = await RouteStarItem.distinct('itemParent');
    const types = await RouteStarItem.distinct('type');
    return {
      items: paginatedItems,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      filters: {
        itemParents: itemParents.filter(p => p).sort(),
        types: types.filter(t => t).sort()
      }
    };
  }
  async updateItemFlags(itemId, updates) {
    const { forUse, forSell, itemCategory } = updates;
    const item = await RouteStarItem.findById(itemId);
    if (!item) {
      throw new Error('Item not found');
    }
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    const canonicalName = aliasMap[item.itemName.toLowerCase()] || item.itemName;
    const itemsToUpdate = await RouteStarItem.find({
      itemName: {
        $in: Object.keys(aliasMap).filter(alias => aliasMap[alias] === canonicalName)
      }
    });
    if (itemsToUpdate.length === 0) {
      itemsToUpdate.push(item);
    }
    const updatePromises = itemsToUpdate.map(async (itemToUpdate) => {
      if (forUse !== undefined) {
        itemToUpdate.forUse = forUse;
      }
      if (forSell !== undefined) {
        itemToUpdate.forSell = forSell;
      }
      if (itemCategory !== undefined && ['Service', 'Item'].includes(itemCategory)) {
        itemToUpdate.itemCategory = itemCategory;
      }
      return itemToUpdate.save();
    });
    await Promise.all(updatePromises);
    return item;
  }
  async deleteAllItems() {
    const result = await RouteStarItem.deleteMany({});
    return {
      deletedCount: result.deletedCount
    };
  }
  async syncItems() {
    const RouteStarSyncService = require('./routeStarSync.service');
    const syncService = new RouteStarSyncService();
    await syncService.init();
    const result = await syncService.syncItems(Infinity);
    await syncService.close();
    return result;
  }
  async getSalesReport(search, page, limit) {
    console.time('[getSalesReport] Total execution');
    const [salesByItem, allItems] = await Promise.all([
      (async () => {
        console.time('[getSalesReport] Sales aggregation');
        const result = await RouteStarInvoice.aggregate([
          {
            $match: {
              status: { $in: ['Completed', 'Closed', 'Pending'] }
            }
          },
          { $unwind: '$lineItems' },
          {
            $match: {
              'lineItems.name': { $exists: true, $ne: '', $ne: null }
            }
          },
          {
            $group: {
              _id: '$lineItems.name',
              totalQuantity: { $sum: '$lineItems.quantity' },
              totalAmount: { $sum: '$lineItems.amount' },
              uniqueInvoices: { $addToSet: '$invoiceNumber' },
              invoiceDetails: {
                $push: {
                  invoiceNumber: '$invoiceNumber',
                  invoiceDate: '$invoiceDate',
                  quantity: '$lineItems.quantity',
                  rate: '$lineItems.rate',
                  amount: '$lineItems.amount',
                  customer: '$customer.name',
                  status: '$status'
                }
              }
            }
          },
          {
            $project: {
              itemName: '$_id',
              soldQuantity: '$totalQuantity',
              soldAmount: '$totalAmount',
              invoiceCount: { $size: '$uniqueInvoices' },
              invoiceDetails: { $slice: ['$invoiceDetails', 100] }
            }
          }
        ]).allowDiskUse(true);
        console.timeEnd('[getSalesReport] Sales aggregation');
        console.log(`[getSalesReport] Found sales for ${result.length} items`);
        return result;
      })(),
      (async () => {
        console.time('[getSalesReport] Fetch items');
        const result = await RouteStarItem.find()
          .select('itemName itemParent description itemCategory qtyOnHand forUse forSell')
          .sort({ itemName: 1 })
          .lean();
        console.timeEnd('[getSalesReport] Fetch items');
        console.log(`[getSalesReport] Found ${result.length} items`);
        return result;
      })()
    ]);
    console.time('[getSalesReport] Merge');
    const salesMap = new Map();
    salesByItem.forEach(sale => {
      salesMap.set(sale.itemName, sale);
    });
    const itemsWithSales = allItems.map(item => {
      const sales = salesMap.get(item.itemName);
      return {
        _id: item._id,
        itemName: item.itemName,
        itemParent: item.itemParent,
        description: item.description,
        itemCategory: item.itemCategory,
        qtyOnHand: item.qtyOnHand,
        forUse: item.forUse,
        forSell: item.forSell,
        soldQuantity: sales?.soldQuantity || 0,
        soldAmount: sales?.soldAmount || 0,
        invoiceCount: sales?.invoiceCount || 0,
        invoiceDetails: sales?.invoiceDetails || []
      };
    });
    console.timeEnd('[getSalesReport] Merge');
    let reportItems = itemsWithSales;
    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      reportItems = reportItems.filter(item =>
        searchRegex.test(item.itemName || '') ||
        searchRegex.test(item.itemParent || '') ||
        searchRegex.test(item.description || '')
      );
    }
    // Totals reflect the (search-filtered) set so the report footer/stat cards
    // stay consistent with what's shown — identical to before when no search.
    const totals = {
      totalItems: reportItems.length,
      totalSoldQuantity: reportItems.reduce((sum, s) => sum + (s.soldQuantity || 0), 0),
      totalSoldAmount: reportItems.reduce((sum, s) => sum + (s.soldAmount || 0), 0),
      totalInvoices: reportItems.reduce((sum, s) => sum + (s.invoiceCount || 0), 0)
    };
    const total = reportItems.length;
    const lim = parseInt(limit, 10);
    const pg = parseInt(page, 10) || 1;
    const pageItems = lim && lim > 0
      ? reportItems.slice((pg - 1) * lim, (pg - 1) * lim + lim)
      : reportItems;
    console.timeEnd('[getSalesReport] Total execution');
    console.log('[getSalesReport] Totals:', totals);
    return {
      items: pageItems,
      totals,
      total,
      page: lim && lim > 0 ? pg : 1,
      pages: lim && lim > 0 ? Math.ceil(total / lim) : 1
    };
  }
  async getItemsWithStats(filters = {}, pagination = {}) {
    const {
      search,
      itemParent,
      type,
      itemCategory,
      forUse,
      forSell,
      mapped
    } = filters;
    const {
      page = 1,
      limit = 50,
      sortBy = 'itemName',
      sortOrder = 'asc'
    } = pagination;
    const query = {};
    if (itemParent && itemParent !== 'all') {
      query.itemParent = itemParent;
    }
    if (type && type !== 'all') {
      query.type = type;
    }
    if (forUse === 'true') {
      query.forUse = true;
    }
    if (forSell === 'true') {
      query.forSell = true;
    }
    if (itemCategory && itemCategory !== 'all') {
      query.itemCategory = itemCategory;
    }
    const [allItems, aliasMap, itemParents, types, mappedCategories] = await Promise.all([
      RouteStarItem.find(query).sort({ itemName: sortOrder === 'asc' ? 1 : -1 }).lean(),
      RouteStarItemAlias.buildLookupMap(),
      RouteStarItem.distinct('itemParent'),
      RouteStarItem.distinct('type'),
      ModelCategory.distinct('categoryItemName')
    ]);
    const mappedCategorySet = new Set(mappedCategories.map(name => name?.toLowerCase()).filter(Boolean));
    console.log(`[getItemsWithStats] Found ${allItems.length} items before merging`);
    const groupedByCanonical = {};
    allItems.forEach(item => {
      const canonicalName = aliasMap[item.itemName.toLowerCase()] || item.itemName;
      if (!groupedByCanonical[canonicalName]) {
        groupedByCanonical[canonicalName] = {
          _id: item._id,
          itemName: canonicalName,
          itemParent: item.itemParent,
          description: item.description,
          itemCategory: item.itemCategory,
          qtyOnHand: 0,
          forUse: item.forUse,
          forSell: item.forSell,
          type: item.type,
          isMapped: mappedCategorySet.has(canonicalName.toLowerCase()),
          mergedCount: 0,
          variations: []
        };
      }
      groupedByCanonical[canonicalName].qtyOnHand += (item.qtyOnHand || 0);
      groupedByCanonical[canonicalName].mergedCount++;
      groupedByCanonical[canonicalName].variations.push(item.itemName);
      if (item.forUse) groupedByCanonical[canonicalName].forUse = true;
      if (item.forSell) groupedByCanonical[canonicalName].forSell = true;
    });
    let mergedItems = Object.values(groupedByCanonical);
    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      mergedItems = mergedItems.filter(item => {
        return searchRegex.test(item.itemName) ||
               searchRegex.test(item.itemParent || '') ||
               searchRegex.test(item.description || '') ||
               item.variations.some(variation => searchRegex.test(variation));
      });
    }
    if (mapped === 'mapped') {
      mergedItems = mergedItems.filter(item => item.isMapped);
    } else if (mapped === 'unmapped') {
      mergedItems = mergedItems.filter(item => !item.isMapped);
    }
    const statsTotal = mergedItems.length;
    const forUseCount = mergedItems.filter(item => item.forUse).length;
    const forSellCount = mergedItems.filter(item => item.forSell).length;
    const bothCount = mergedItems.filter(item => item.forUse && item.forSell).length;
    const unmarkedCount = mergedItems.filter(item => !item.forUse && !item.forSell).length;
    const stats = {
      total: statsTotal,
      forUse: forUseCount,
      forSell: forSellCount,
      both: bothCount,
      unmarked: unmarkedCount
    };
    const total = mergedItems.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedItems = mergedItems.slice(skip, skip + parseInt(limit));
    console.log(`[getItemsWithStats] Merged to ${mergedItems.length} canonical items, returning ${paginatedItems.length} for page ${page}`);
    return {
      items: paginatedItems,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      filters: {
        itemParents: itemParents.filter(p => p).sort(),
        types: types.filter(t => t).sort()
      },
      stats
    };
  }
}
module.exports = new RouteStarItemsService();
