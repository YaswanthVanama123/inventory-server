const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const RouteStarItem = require('../models/RouteStarItem');

// In-memory cache with TTL
const cache = {
  routeStarItems: null,
  routeStarItemsExpiry: 0,
  pageData: null,
  pageDataExpiry: 0
};

const CACHE_TTL = {
  ROUTESTAR_ITEMS: 5 * 60 * 1000, // 5 minutes
  PAGE_DATA: 30 * 1000 // 30 seconds
};

class ManualPurchaseOrderItemService {
  async generateUniqueSku() {
    try {
      // Find the highest SKU number efficiently
      const latestItem = await ManualPurchaseOrderItem.findOne()
        .sort({ createdAt: -1 })
        .select('sku')
        .lean()
        .maxTimeMS(3000);

      let nextNumber = 1;

      if (latestItem?.sku) {
        const match = latestItem.sku.match(/^CUSTOM-(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }

      return `CUSTOM-${String(nextNumber).padStart(3, '0')}`;
    } catch (error) {
      console.error('[ERROR] SKU generation failed:', error);
      // Fallback to random SKU
      const randomNum = Math.floor(Math.random() * 1000000);
      return `CUSTOM-${String(randomNum).padStart(6, '0')}`;
    }
  }

  async createItem(itemData, userId) {
    try {
      const { name, description, mappedCategoryItemId, mappedCategoryItemName, vendorId, vendorName } = itemData;

      if (!name?.trim()) {
        throw new Error('Item name is required');
      }

      // SKU is optional. If user supplied one, normalize and check uniqueness;
      // otherwise auto-generate the next CUSTOM-NNN.
      let sku;
      if (itemData.sku && itemData.sku.trim()) {
        sku = itemData.sku.trim().toUpperCase();
        const existing = await ManualPurchaseOrderItem.findOne({ sku }).lean();
        if (existing) {
          const err = new Error(`SKU "${sku}" already exists`);
          err.code = 'DUPLICATE_SKU';
          throw err;
        }
      } else {
        sku = await this.generateUniqueSku();
      }

      const item = new ManualPurchaseOrderItem({
        sku,
        name: name.trim(),
        description: description?.trim() || null,
        mappedCategoryItemId: mappedCategoryItemId || null,
        mappedCategoryItemName: mappedCategoryItemName?.trim() || null,
        vendorId: vendorId || null,
        vendorName: vendorName?.trim() || null,
        createdBy: userId,
        lastUpdatedBy: userId
      });

      const savedItem = await item.save();

      // Invalidate cache after creating new item
      this.invalidateCache();

      return savedItem;
    } catch (error) {
      // Handle duplicate SKU error with retry — only if SKU was auto-generated.
      // If user supplied an SKU and it collided, surface the error directly.
      if (error.code === 11000 && error.keyPattern?.sku && !itemData.sku) {
        const randomNum = Math.floor(Math.random() * 1000000);
        const newSku = `CUSTOM-${String(randomNum).padStart(6, '0')}`;

        const item = new ManualPurchaseOrderItem({
          sku: newSku,
          name: itemData.name.trim(),
          description: itemData.description?.trim() || null,
          mappedCategoryItemId: itemData.mappedCategoryItemId || null,
          mappedCategoryItemName: itemData.mappedCategoryItemName?.trim() || null,
          vendorId: itemData.vendorId || null,
          vendorName: itemData.vendorName?.trim() || null,
          createdBy: userId,
          lastUpdatedBy: userId
        });

        const savedItem = await item.save();
        this.invalidateCache();
        return savedItem;
      }

      throw error;
    }
  }

  invalidateCache() {
    cache.pageData = null;
    cache.pageDataExpiry = 0;
  }

  async getAllItems(search, page, limit) {
    const ModelCategory = require('../models/ModelCategory');

    const query = {};
    if (search) {
      query.$or = [
        { sku: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } },
        { mappedCategoryItemName: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await ManualPurchaseOrderItem.countDocuments(query);
    const lim = parseInt(limit, 10);
    const pg = parseInt(page, 10) || 1;
    let itemsQuery = ManualPurchaseOrderItem.find(query)
      .populate('vendorId', 'name email phone')
      .sort({ name: 1 });
    if (lim && lim > 0) {
      itemsQuery = itemsQuery.skip((pg - 1) * lim).limit(lim);
    }

    const items = await itemsQuery.lean();

    // Resolve Model→Category mappings for THESE items by their exact SKU. The
    // mapping lives in ModelCategory keyed by modelNumber === the manual item's
    // SKU. Match the page's SKUs ($in) rather than a "/^CUSTOM-/" prefix, which
    // wrongly missed items whose SKU has no hyphen (e.g. CUSTOM9963, RICEBAG15).
    const skus = items.map(i => i.sku).filter(Boolean);
    const modelMappings = skus.length
      ? await ModelCategory.find({ modelNumber: { $in: skus } }).lean()
      : [];

    // Build lookup of ModelCategory mappings by modelNumber
    const modelMappingLookup = new Map();
    for (const mapping of modelMappings) {
      modelMappingLookup.set(mapping.modelNumber, mapping);
    }

    // Enrich items: if item has no mappedCategoryItemName but ModelCategory has a mapping, use it
    for (const item of items) {
      if (!item.mappedCategoryItemName) {
        const mapping = modelMappingLookup.get(item.sku);
        if (mapping?.categoryItemName) {
          item.mappedCategoryItemName = mapping.categoryItemName;
          item.mappedCategoryItemId = mapping.categoryItemId;
        }
      }
    }

    return {
      items,
      total,
      page: lim && lim > 0 ? pg : 1,
      pages: lim && lim > 0 ? Math.ceil(total / lim) : 1
    };
  }

  async getActiveItems() {
    const items = await ManualPurchaseOrderItem.find({ isActive: true })
      .populate('vendorId', 'name email phone')
      .sort({ name: 1 })
      .lean();

    return {
      items,
      total: items.length
    };
  }

  async getItemBySku(sku) {
    const item = await ManualPurchaseOrderItem.findOne({ sku: sku.toUpperCase() })
      .populate('vendorId', 'name email phone')
      .lean();

    if (!item) {
      throw new Error('Item not found');
    }
    return item;
  }

  async updateItem(sku, updateData, userId) {
    const item = await ManualPurchaseOrderItem.findOne({ sku: sku.toUpperCase() });
    if (!item) {
      throw new Error('Item not found');
    }

    // SKU change: validate uniqueness, then cascade rename across linked
    // manual PurchaseOrder line items so existing orders keep referencing
    // the same logical product. The Mongo _id remains the stable internal
    // identifier — SKU is just the user-facing label.
    let skuRenamedFrom = null;
    let skuRenamedTo = null;
    if (
      updateData.sku !== undefined &&
      updateData.sku !== null &&
      String(updateData.sku).trim() !== ''
    ) {
      const newSku = String(updateData.sku).trim().toUpperCase();
      if (newSku !== item.sku) {
        const conflict = await ManualPurchaseOrderItem.findOne({
          sku: newSku,
          _id: { $ne: item._id }
        }).lean();
        if (conflict) {
          const err = new Error(`SKU "${newSku}" already exists`);
          err.code = 'DUPLICATE_SKU';
          throw err;
        }
        skuRenamedFrom = item.sku;
        skuRenamedTo = newSku;
        item.sku = newSku;
      }
    }

    // Update other fields
    if (updateData.name) item.name = updateData.name.trim();
    if (updateData.description !== undefined) item.description = updateData.description?.trim() || null;
    if (updateData.mappedCategoryItemId !== undefined) {
      item.mappedCategoryItemId = updateData.mappedCategoryItemId || null;
    }
    if (updateData.mappedCategoryItemName !== undefined) {
      item.mappedCategoryItemName = updateData.mappedCategoryItemName?.trim() || null;
    }
    if (updateData.vendorId !== undefined) {
      item.vendorId = updateData.vendorId || null;
    }
    if (updateData.vendorName !== undefined) {
      item.vendorName = updateData.vendorName?.trim() || null;
    }
    if (updateData.isActive !== undefined) item.isActive = updateData.isActive;

    item.lastUpdatedBy = userId;

    const updated = await item.save();

    // Cascade SKU rename across every collection that stores the SKU as a
    // foreign key. Done after save() so the master record is updated first;
    // if the cascade fails we surface the error but the item record reflects
    // the new SKU. The Mongo _id is the stable internal identifier — SKU is
    // just the user-facing label and should be safe to rename.
    if (skuRenamedFrom && skuRenamedTo) {
      await this.cascadeSkuRename(skuRenamedFrom, skuRenamedTo);
    }

    // Invalidate cache after update
    this.invalidateCache();

    return updated;
  }

  /**
   * Rename a SKU everywhere it's referenced. Manual PO items are only ever
   * referenced from manual purchase orders (source: 'manual'), but the rest
   * of the inventory pipeline stores the SKU directly on stock summaries,
   * stock movements, model-category mappings, discrepancies, and truck
   * checkouts. All of those need to follow the rename or the Stock page,
   * dashboards, and history views will keep showing the old SKU.
   */
  async cascadeSkuRename(oldSku, newSku) {
    const PurchaseOrder = require('../models/PurchaseOrder');
    const StockSummary = require('../models/StockSummary');
    const StockMovement = require('../models/StockMovement');
    const ModelCategory = require('../models/ModelCategory');
    const OrderDiscrepancy = require('../models/OrderDiscrepancy');
    const TruckCheckout = require('../models/TruckCheckout');

    const tasks = [
      // Manual purchase orders: rename the SKU inside line items.
      PurchaseOrder.updateMany(
        { source: 'manual', 'items.sku': oldSku },
        { $set: { 'items.$[item].sku': newSku } },
        { arrayFilters: [{ 'item.sku': oldSku }] }
      ),
      // Stock summary keyed by SKU.
      StockSummary.updateMany({ sku: oldSku }, { $set: { sku: newSku } }),
      // Stock movement history.
      StockMovement.updateMany({ sku: oldSku }, { $set: { sku: newSku } }),
      // ModelCategory uses `modelNumber` for the SKU-to-category mapping.
      // This is what drives the Stock Management category folders — without
      // updating it, the renamed item shows up under the old SKU label.
      ModelCategory.updateMany({ modelNumber: oldSku }, { $set: { modelNumber: newSku } }),
      // Order discrepancy records.
      OrderDiscrepancy.updateMany({ sku: oldSku }, { $set: { sku: newSku } }),
      // Truck checkouts: SKU appears in several nested arrays.
      TruckCheckout.updateMany(
        { 'itemsTaken.sku': oldSku },
        { $set: { 'itemsTaken.$[item].sku': newSku } },
        { arrayFilters: [{ 'item.sku': oldSku }] }
      ),
      TruckCheckout.updateMany(
        { 'fetchedInvoices.items.sku': oldSku },
        { $set: { 'fetchedInvoices.$[].items.$[item].sku': newSku } },
        { arrayFilters: [{ 'item.sku': oldSku }] }
      ),
      TruckCheckout.updateMany(
        { 'tallyResults.itemsTaken.sku': oldSku },
        { $set: { 'tallyResults.itemsTaken.$[item].sku': newSku } },
        { arrayFilters: [{ 'item.sku': oldSku }] }
      ),
      TruckCheckout.updateMany(
        { 'tallyResults.itemsSold.sku': oldSku },
        { $set: { 'tallyResults.itemsSold.$[item].sku': newSku } },
        { arrayFilters: [{ 'item.sku': oldSku }] }
      ),
      TruckCheckout.updateMany(
        { 'tallyResults.discrepancies.sku': oldSku },
        { $set: { 'tallyResults.discrepancies.$[item].sku': newSku } },
        { arrayFilters: [{ 'item.sku': oldSku }] }
      ),
    ];

    // Run them concurrently; a failure in one shouldn't roll back the others
    // (those still represent valid state). Surface errors so the caller can log.
    const results = await Promise.allSettled(tasks);
    const failures = results
      .map((r, i) => (r.status === 'rejected' ? `${i}: ${r.reason?.message || r.reason}` : null))
      .filter(Boolean);
    if (failures.length) {
      console.error(
        `[cascadeSkuRename] ${failures.length} cascade target(s) failed for ${oldSku} -> ${newSku}:`,
        failures
      );
    }
  }

  async deleteItem(sku) {
    const result = await ManualPurchaseOrderItem.findOneAndDelete({
      sku: sku.toUpperCase()
    });

    if (!result) {
      throw new Error('Item not found');
    }

    // Invalidate cache after delete
    this.invalidateCache();

    return result;
  }

  async getPageData(options = {}) {
    const { search, page, limit } = options;
    const hasParams = search !== undefined || page !== undefined || limit !== undefined;

    // The blob cache only covers the parameterless default call. Any paginated /
    // filtered request bypasses it (the shape depends on the params).
    const now = Date.now();
    if (!hasParams && cache.pageData && now < cache.pageDataExpiry) {
      return cache.pageData;
    }

    const startTime = now;

    try {
      const Vendor = require('../models/Vendor');

      // Fetch the (paginated) items, the full dropdown sources, and full-set
      // stats in parallel. Dropdowns (routeStarItems, vendors) stay FULL.
      const [itemsResult, routeStarResult, vendorsResult, stats] = await Promise.all([
        this.getAllItems(search, page, limit),
        this.getRouteStarItems(),
        Vendor.find({ isActive: true })
          .select('_id name email phone')
          .sort({ name: 1 })
          .lean()
          .maxTimeMS(5000),
        this.getItemStats(search)
      ]);

      const lim = parseInt(limit, 10);
      const result = {
        items: itemsResult.items || [],
        routeStarItems: routeStarResult.items || [],
        vendors: vendorsResult || [],
        stats,
        pagination: {
          total: itemsResult.total || 0,
          page: itemsResult.page || 1,
          limit: lim && lim > 0 ? lim : (itemsResult.total || 0),
          totalPages: itemsResult.pages || 1
        },
        totals: {
          items: itemsResult.total || 0,
          routeStarItems: routeStarResult.total || 0,
          vendors: vendorsResult.length || 0
        }
      };

      // Only cache the parameterless default response.
      if (!hasParams) {
        cache.pageData = result;
        cache.pageDataExpiry = now + CACHE_TTL.PAGE_DATA;
      }

      const endTime = Date.now();
      console.log(`[PERF] getPageData completed in ${endTime - startTime}ms`);

      return result;
    } catch (error) {
      console.error('[ERROR] getPageData failed:', error);
      throw error;
    }
  }

  /**
   * Dashboard stats computed over the FULL item set (respecting the same search
   * filter as the list, so the counts match what the user is looking at).
   */
  async getItemStats(search) {
    const match = {};
    if (search) {
      match.$or = [
        { sku: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } },
        { mappedCategoryItemName: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, mapped, active] = await Promise.all([
      ManualPurchaseOrderItem.countDocuments(match),
      ManualPurchaseOrderItem.countDocuments({
        ...match,
        mappedCategoryItemId: { $ne: null }
      }),
      ManualPurchaseOrderItem.countDocuments({ ...match, isActive: true })
    ]);

    return { total, mapped, active };
  }

  async getRouteStarItems() {
    // Check cache first
    const now = Date.now();
    if (cache.routeStarItems && now < cache.routeStarItemsExpiry) {
      return cache.routeStarItems;
    }

    const startTime = now;

    try {
      const RouteStarItemAlias = require('../models/RouteStarItemAlias');

      // Fetch both datasets in parallel with optimized queries
      const [allMappings, allRouteStarItems] = await Promise.all([
        RouteStarItemAlias.find({ isActive: true })
          .select('_id canonicalName description aliases')
          .sort({ canonicalName: 1 })
          .lean()
          .maxTimeMS(8000),
        RouteStarItem.find()
          .select('_id itemName itemParent description')
          .limit(300)
          .sort({ itemName: 1 })
          .lean()
          .maxTimeMS(8000)
      ]);

      // Build a Set of mapped item names (lowercase for case-insensitive comparison)
      const mappedItemNames = new Set();
      for (const mapping of allMappings) {
        if (mapping.aliases && Array.isArray(mapping.aliases)) {
          for (const alias of mapping.aliases) {
            if (alias && alias.name) {
              // Add both the exact name and lowercase version for matching
              mappedItemNames.add(alias.name.toLowerCase().trim());
            }
          }
        }
      }

      // Filter unmapped items efficiently
      const unmappedItems = [];
      for (const item of allRouteStarItems) {
        if (item.itemName) {
          const itemNameLower = item.itemName.toLowerCase().trim();
          // Only include if NOT mapped to any canonical name
          if (!mappedItemNames.has(itemNameLower)) {
            unmappedItems.push({
              _id: item._id,
              itemName: item.itemName,
              description: item.description,
              type: 'routestar',
              itemParent: item.itemParent
            });
          }
        }
      }

      // Format canonical items (these should always appear)
      const canonicalItems = allMappings.map(mapping => ({
        _id: mapping._id,
        itemName: mapping.canonicalName,
        description: mapping.description,
        type: 'canonical',
        aliasCount: mapping.aliases?.length || 0
      }));

      // Combine and sort alphabetically
      const allItems = [...canonicalItems, ...unmappedItems].sort((a, b) =>
        a.itemName.localeCompare(b.itemName, undefined, { sensitivity: 'base' })
      );

      const result = {
        items: allItems,
        total: allItems.length
      };

      // Cache the result
      cache.routeStarItems = result;
      cache.routeStarItemsExpiry = now + CACHE_TTL.ROUTESTAR_ITEMS;

      const endTime = Date.now();
      console.log(`[PERF] getRouteStarItems completed in ${endTime - startTime}ms (${result.total} items, ${canonicalItems.length} canonical, ${unmappedItems.length} unmapped)`);

      return result;
    } catch (error) {
      console.error('[ERROR] getRouteStarItems failed:', error);
      throw error;
    }
  }
}

module.exports = new ManualPurchaseOrderItemService();
