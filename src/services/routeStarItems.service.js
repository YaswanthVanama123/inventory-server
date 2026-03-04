const RouteStarItem = require('../models/RouteStarItem');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const RouteStarSyncService = require('./routeStarSync.service');

/**
 * RouteStar Items Service
 * Handles all business logic for RouteStar items operations
 */
class RouteStarItemsService {
  /**
   * Get item statistics
   */
  async getItemStats() {
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    const allItems = await RouteStarItem.find().lean();

    const groupedByCanonical = {};

    allItems.forEach(item => {
      const canonicalName = aliasMap[item.itemName.toLowerCase()] || item.itemName;

      if (!groupedByCanonical[canonicalName]) {
        groupedByCanonical[canonicalName] = {
          forUse: false,
          forSell: false,
          isMapped: !!aliasMap[item.itemName.toLowerCase()]
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

  /**
   * Get items with filtering and pagination
   */
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
          isMapped: !!aliasMap[item.itemName.toLowerCase()],
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

    // Apply search filter AFTER merging (on canonical names)
    if (search) {
      const searchRegex = new RegExp(search, 'i');
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

  /**
   * Update item flags
   */
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

  /**
   * Delete all items
   */
  async deleteAllItems() {
    const result = await RouteStarItem.deleteMany({});

    return {
      deletedCount: result.deletedCount
    };
  }

  /**
   * Sync items from RouteStar
   */
  async syncItems() {
    const RouteStarSyncService = require('./routeStarSync.service');
    const syncService = new RouteStarSyncService();

    await syncService.init();
    const result = await syncService.syncItems(Infinity);
    await syncService.close();

    return result;
  }

  /**
   * Get sales report - OPTIMIZED (Parallel execution)
   * Start from invoices (smaller filtered dataset), run queries in parallel
   */
  async getSalesReport() {
    console.time('[getSalesReport] Total execution');

    // Run both queries in parallel for maximum performance
    const [salesByItem, allItems] = await Promise.all([
      // Query 1: Get sales data aggregated by item name (from invoices)
      (async () => {
        console.time('[getSalesReport] Sales aggregation');
        const result = await RouteStarInvoice.aggregate([
          // Filter invoices first (reduces dataset significantly)
          {
            $match: {
              status: { $in: ['Completed', 'Closed', 'Pending'] }
            }
          },

          // Unwind line items
          { $unwind: '$lineItems' },

          // Filter out empty item names
          {
            $match: {
              'lineItems.name': { $exists: true, $ne: '', $ne: null }
            }
          },

          // Group by item name and calculate sales metrics
          {
            $group: {
              _id: '$lineItems.name',
              totalQuantity: { $sum: '$lineItems.quantity' },
              totalAmount: { $sum: '$lineItems.amount' },
              uniqueInvoices: { $addToSet: '$invoiceNumber' },
              // Limit invoice details to first 100 to prevent massive arrays
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

          // Calculate invoice count and limit invoice details
          {
            $project: {
              itemName: '$_id',
              soldQuantity: '$totalQuantity',
              soldAmount: '$totalAmount',
              invoiceCount: { $size: '$uniqueInvoices' },
              // Limit to first 100 invoice details to reduce data transfer
              invoiceDetails: { $slice: ['$invoiceDetails', 100] }
            }
          }
        ]).allowDiskUse(true);
        console.timeEnd('[getSalesReport] Sales aggregation');
        console.log(`[getSalesReport] Found sales for ${result.length} items`);
        return result;
      })(),

      // Query 2: Get all items (runs in parallel)
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

    // Create sales map for O(1) lookup
    console.time('[getSalesReport] Merge');
    const salesMap = new Map();
    salesByItem.forEach(sale => {
      salesMap.set(sale.itemName, sale);
    });

    // Merge items with sales data
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

    // Calculate totals
    const totals = {
      totalItems: allItems.length,
      totalSoldQuantity: salesByItem.reduce((sum, s) => sum + s.soldQuantity, 0),
      totalSoldAmount: salesByItem.reduce((sum, s) => sum + s.soldAmount, 0),
      totalInvoices: salesByItem.reduce((sum, s) => sum + s.invoiceCount, 0)
    };

    console.timeEnd('[getSalesReport] Total execution');
    console.log('[getSalesReport] Totals:', totals);

    return {
      items: itemsWithSales,
      totals
    };
  }

  /**
   * OPTIMIZED: Get items list with stats in one call
   * Builds alias map once and reuses it for both items and stats
   */
  async getItemsWithStats(filters = {}, pagination = {}) {
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

    // Fetch all data in parallel
    const [allItems, aliasMap, itemParents, types] = await Promise.all([
      RouteStarItem.find(query).sort({ itemName: sortOrder === 'asc' ? 1 : -1 }).lean(),
      RouteStarItemAlias.buildLookupMap(),
      RouteStarItem.distinct('itemParent'),
      RouteStarItem.distinct('type')
    ]);

    console.log(`[getItemsWithStats] Found ${allItems.length} items before merging`);

    // Group items by canonical name (merge variations)
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
          isMapped: !!aliasMap[item.itemName.toLowerCase()],
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

    // Apply search filter AFTER merging (on canonical names)
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      mergedItems = mergedItems.filter(item => {
        return searchRegex.test(item.itemName) ||
               searchRegex.test(item.itemParent || '') ||
               searchRegex.test(item.description || '') ||
               item.variations.some(variation => searchRegex.test(variation));
      });
    }

    // Calculate stats from merged items
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

    // Paginate merged items
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
