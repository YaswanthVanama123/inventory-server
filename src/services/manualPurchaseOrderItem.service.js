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

      const sku = await this.generateUniqueSku();

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
      // Handle duplicate SKU error with retry
      if (error.code === 11000 && error.keyPattern?.sku) {
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

  async getAllItems() {
    const items = await ManualPurchaseOrderItem.find()
      .populate('vendorId', 'name email phone')
      .sort({ name: 1 })
      .lean();

    return {
      items,
      total: items.length
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

    // Update fields
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

    // Invalidate cache after update
    this.invalidateCache();

    return updated;
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

  async getPageData() {
    // Check cache first
    const now = Date.now();
    if (cache.pageData && now < cache.pageDataExpiry) {
      return cache.pageData;
    }

    const startTime = now;

    try {
      const Vendor = require('../models/Vendor');

      // Fetch all three datasets in parallel
      const [itemsResult, routeStarResult, vendorsResult] = await Promise.all([
        this.getAllItems(),
        this.getRouteStarItems(),
        Vendor.find({ isActive: true })
          .select('_id name email phone')
          .sort({ name: 1 })
          .lean()
          .maxTimeMS(5000)
      ]);

      const result = {
        items: itemsResult.items || [],
        routeStarItems: routeStarResult.items || [],
        vendors: vendorsResult || [],
        totals: {
          items: itemsResult.total || 0,
          routeStarItems: routeStarResult.total || 0,
          vendors: vendorsResult.length || 0
        }
      };

      // Cache the result
      cache.pageData = result;
      cache.pageDataExpiry = now + CACHE_TTL.PAGE_DATA;

      const endTime = Date.now();
      console.log(`[PERF] getPageData completed in ${endTime - startTime}ms`);

      return result;
    } catch (error) {
      console.error('[ERROR] getPageData failed:', error);
      throw error;
    }
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
