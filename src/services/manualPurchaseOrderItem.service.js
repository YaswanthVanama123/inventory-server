const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const RouteStarItem = require('../models/RouteStarItem');

const cache = {
  routeStarItems: null,
  routeStarItemsExpiry: 0,
  pageData: null,
  pageDataExpiry: 0
};

const CACHE_TTL = {
  ROUTESTAR_ITEMS: 5 * 60 * 1000,
  PAGE_DATA: 30 * 1000
};

class ManualPurchaseOrderItemService {
  async generateUniqueSku() {
    try {
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

      if (savedItem.mappedCategoryItemName) {
        await this.syncMappingToModelCategory(
          savedItem.sku,
          savedItem.mappedCategoryItemName,
          savedItem.mappedCategoryItemId,
          userId
        );
      }

      this.invalidateCache();

      return savedItem;
    } catch (error) {
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
        if (savedItem.mappedCategoryItemName) {
          await this.syncMappingToModelCategory(
            savedItem.sku,
            savedItem.mappedCategoryItemName,
            savedItem.mappedCategoryItemId,
            userId
          );
        }
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

    const skusUpper = [...new Set(items.map(i => (i.sku || '').toUpperCase()).filter(Boolean))];
    const modelMappings = skusUpper.length
      ? await ModelCategory.find({ modelNumber: { $in: skusUpper } }).lean()
      : [];

    const modelMappingLookup = new Map();
    for (const mapping of modelMappings) {
      modelMappingLookup.set((mapping.modelNumber || '').toUpperCase(), mapping);
    }

    for (const item of items) {
      if (!item.mappedCategoryItemName) {
        const mapping = modelMappingLookup.get((item.sku || '').toUpperCase());
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

  async syncMappingToModelCategory(sku, categoryItemName, categoryItemId, userId) {
    if (!sku) return;
    const ModelCategory = require('../models/ModelCategory');
    const modelNumber = String(sku).toUpperCase();

    if (categoryItemName) {
      await ModelCategory.upsertMapping(
        modelNumber,
        categoryItemName,
        categoryItemId || null,
        userId
      );
    } else {
      await ModelCategory.findOneAndDelete({ modelNumber });
    }
  }

  async removeStockLinkage(skus) {
    const ModelCategory = require('../models/ModelCategory');
    const CustomerConnectOrder = require('../models/CustomerConnectOrder');
    const upper = [...new Set((skus || []).filter(Boolean).map(s => String(s).toUpperCase()))];
    if (upper.length === 0) return { removed: 0, keptShared: [] };

    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const shared = await CustomerConnectOrder.aggregate([
      { $match: { 'items.sku': { $in: upper.map(s => new RegExp(`^${escape(s)}$`, 'i')) } } },
      { $unwind: '$items' },
      { $project: { sku: { $toUpper: '$items.sku' } } },
      { $match: { sku: { $in: upper } } },
      { $group: { _id: '$sku' } }
    ]);
    const keptShared = shared.map(s => s._id);
    const toUnlink = upper.filter(s => !keptShared.includes(s));
    const result = toUnlink.length
      ? await ModelCategory.deleteMany({ modelNumber: { $in: toUnlink } })
      : { deletedCount: 0 };
    if (keptShared.length) {
      console.log(`[ManualPOItems] Kept RouteStar mapping for ${keptShared.join(', ')}: CustomerConnect orders use the same SKU`);
    }
    return { removed: result.deletedCount, keptShared };
  }

  async updateItem(sku, updateData, userId) {
    const item = await ManualPurchaseOrderItem.findOne({ sku: sku.toUpperCase() });
    if (!item) {
      throw new Error('Item not found');
    }

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

    if (
      updateData.mappedCategoryItemName !== undefined ||
      updateData.mappedCategoryItemId !== undefined
    ) {
      await this.syncMappingToModelCategory(
        updated.sku,
        updated.mappedCategoryItemName,
        updated.mappedCategoryItemId,
        userId
      );
    }

    if (skuRenamedFrom && skuRenamedTo) {
      await this.cascadeSkuRename(skuRenamedFrom, skuRenamedTo);
    }

    this.invalidateCache();

    return updated;
  }

  async cascadeSkuRename(oldSku, newSku) {
    const PurchaseOrder = require('../models/PurchaseOrder');
    const StockSummary = require('../models/StockSummary');
    const StockMovement = require('../models/StockMovement');
    const ModelCategory = require('../models/ModelCategory');
    const OrderDiscrepancy = require('../models/OrderDiscrepancy');
    const TruckCheckout = require('../models/TruckCheckout');

    const tasks = [
      PurchaseOrder.updateMany(
        { source: 'manual', 'items.sku': oldSku },
        { $set: { 'items.$[item].sku': newSku } },
        { arrayFilters: [{ 'item.sku': oldSku }] }
      ),
      StockSummary.updateMany({ sku: oldSku }, { $set: { sku: newSku } }),
      StockMovement.updateMany({ sku: oldSku }, { $set: { sku: newSku } }),
      ModelCategory.updateMany({ modelNumber: oldSku }, { $set: { modelNumber: newSku } }),
      OrderDiscrepancy.updateMany({ sku: oldSku }, { $set: { sku: newSku } }),
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
    const normalizedSku = sku.toUpperCase();
    if (!(await ManualPurchaseOrderItem.exists({ sku: normalizedSku }))) {
      throw new Error('Item not found');
    }

    await this.removeStockLinkage([normalizedSku]);

    const result = await ManualPurchaseOrderItem.findOneAndDelete({
      sku: normalizedSku
    });

    if (!result) {
      throw new Error('Item not found');
    }

    this.invalidateCache();

    return result;
  }

  async getPageData(options = {}) {
    const { search, page, limit } = options;
    const hasParams = search !== undefined || page !== undefined || limit !== undefined;

    const now = Date.now();
    if (!hasParams && cache.pageData && now < cache.pageDataExpiry) {
      return cache.pageData;
    }

    const startTime = now;

    try {
      const Vendor = require('../models/Vendor');

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

  async getItemStats(search) {
    const ModelCategory = require('../models/ModelCategory');
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

    const [items, active] = await Promise.all([
      ManualPurchaseOrderItem.find(match).select('sku mappedCategoryItemId').lean(),
      ManualPurchaseOrderItem.countDocuments({ ...match, isActive: true })
    ]);

    const total = items.length;
    const skusUpper = [...new Set(items.map(i => (i.sku || '').toUpperCase()).filter(Boolean))];
    const mappedSkuSet = skusUpper.length
      ? new Set(
          (await ModelCategory.find({
            modelNumber: { $in: skusUpper },
            categoryItemName: { $ne: null }
          }).select('modelNumber').lean()).map(m => (m.modelNumber || '').toUpperCase())
        )
      : new Set();

    const mapped = items.filter(
      i => i.mappedCategoryItemId != null || mappedSkuSet.has((i.sku || '').toUpperCase())
    ).length;

    return { total, mapped, active };
  }

  async getRouteStarItems() {
    const now = Date.now();
    if (cache.routeStarItems && now < cache.routeStarItemsExpiry) {
      return cache.routeStarItems;
    }

    const startTime = now;

    try {
      const RouteStarItemAlias = require('../models/RouteStarItemAlias');

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

      const mappedItemNames = new Set();
      for (const mapping of allMappings) {
        if (mapping.aliases && Array.isArray(mapping.aliases)) {
          for (const alias of mapping.aliases) {
            if (alias && alias.name) {
              mappedItemNames.add(alias.name.toLowerCase().trim());
            }
          }
        }
      }

      const unmappedItems = [];
      for (const item of allRouteStarItems) {
        if (item.itemName) {
          const itemNameLower = item.itemName.toLowerCase().trim();
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

      const canonicalItems = allMappings.map(mapping => ({
        _id: mapping._id,
        itemName: mapping.canonicalName,
        description: mapping.description,
        type: 'canonical',
        aliasCount: mapping.aliases?.length || 0
      }));

      const allItems = [...canonicalItems, ...unmappedItems].sort((a, b) =>
        a.itemName.localeCompare(b.itemName, undefined, { sensitivity: 'base' })
      );

      const result = {
        items: allItems,
        total: allItems.length
      };

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
