const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const RouteStarItem = require('../models/RouteStarItem');
const ModelCategory = require('../models/ModelCategory');


class RouteStarItemAliasService {
  async getAllMappings() {
    const mappings = await RouteStarItemAlias.getAllActiveMappings();
    return {
      mappings,
      total: mappings.length
    };
  }
  async getUniqueItems() {
    const CustomerConnectOrder = require('../models/CustomerConnectOrder');
    const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');

    const [routeStarItems, lookupMap, modelCategoryMappings, orderItemNames, manualPOItems] = await Promise.all([
      RouteStarItem.find()
        .select('itemName itemParent description qtyOnHand')
        .sort({ itemName: 1 })
        .lean(),
      RouteStarItemAlias.buildLookupMap(),
      ModelCategory.find().select('categoryItemName').lean(),
      CustomerConnectOrder.aggregate([
        { $unwind: '$items' },
        { $group: { _id: '$items.name' } },
        { $project: { _id: 0, name: '$_id' } }
      ]),
      ManualPurchaseOrderItem.find({ isActive: true })
        .select('name sku')
        .lean()
    ]);

    // Create a Set of RouteStarItem names that are already mapped in ModelCategory
    const mappedInModelCategory = new Set(
      modelCategoryMappings
        .filter(mc => mc.categoryItemName)
        .map(mc => mc.categoryItemName.toLowerCase())
    );

    // Filter out items that are already mapped in ModelCategory
    const availableRouteStarItems = routeStarItems.filter(item =>
      !mappedInModelCategory.has(item.itemName.toLowerCase())
    );

    // Build a Set of all RouteStarItem names (lowercase) to avoid duplicates
    const routeStarItemNamesSet = new Set(
      routeStarItems.map(item => item.itemName.toLowerCase())
    );

    // Collect purchased item names that are NOT already in RouteStarItems
    const purchasedItems = [];
    const seenPurchasedNames = new Set();

    for (const orderItem of orderItemNames) {
      if (orderItem.name) {
        const nameLower = orderItem.name.toLowerCase().trim();
        if (!routeStarItemNamesSet.has(nameLower) && !seenPurchasedNames.has(nameLower)) {
          seenPurchasedNames.add(nameLower);
          purchasedItems.push({
            itemName: orderItem.name,
            itemParent: 'CustomerConnect Order',
            description: null,
            qtyOnHand: 0
          });
        }
      }
    }

    for (const poItem of manualPOItems) {
      if (poItem.name) {
        const nameLower = poItem.name.toLowerCase().trim();
        if (!routeStarItemNamesSet.has(nameLower) && !seenPurchasedNames.has(nameLower)) {
          seenPurchasedNames.add(nameLower);
          purchasedItems.push({
            itemName: poItem.name,
            itemParent: `Manual PO (${poItem.sku})`,
            description: null,
            qtyOnHand: 0
          });
        }
      }
    }

    // Combine RouteStarItems + purchased items
    const allAvailableItems = [...availableRouteStarItems, ...purchasedItems];

    const itemsWithMappingStatus = allAvailableItems.map(item => ({
      itemName: item.itemName,
      itemParent: item.itemParent,
      description: item.description,
      qtyOnHand: item.qtyOnHand || 0,
      isMapped: !!lookupMap[item.itemName.toLowerCase()],
      canonicalName: lookupMap[item.itemName.toLowerCase()] || null,
      occurrences: 1,
      totalQuantity: item.qtyOnHand || 0
    }));

    // Sort alphabetically
    itemsWithMappingStatus.sort((a, b) => a.itemName.localeCompare(b.itemName, undefined, { sensitivity: 'base' }));

    const stats = {
      totalUniqueItems: allAvailableItems.length,
      mappedItems: itemsWithMappingStatus.filter(i => i.isMapped).length,
      unmappedItems: itemsWithMappingStatus.filter(i => !i.isMapped).length,
      excludedByModelMapping: mappedInModelCategory.size
    };
    return {
      items: itemsWithMappingStatus,
      stats
    };
  }
  async createMapping(mappingData, userId) {
    const { canonicalName, aliases, description, autoMerge = true } = mappingData;
    if (!canonicalName || !aliases || !Array.isArray(aliases) || aliases.length === 0) {
      throw new Error('Canonical name and at least one alias are required');
    }
    const existingMappings = await RouteStarItemAlias.find({
      'aliases.name': { $in: aliases.map(a => typeof a === 'string' ? a : a.name) },
      canonicalName: { $ne: canonicalName },
      isActive: true
    });
    if (existingMappings.length > 0) {
      const conflictError = new Error(
        `Some aliases are already mapped to different canonical names: ${existingMappings.map(m => m.canonicalName).join(', ')}`
      );
      conflictError.conflictingMappings = existingMappings;
      throw conflictError;
    }
    const mapping = await RouteStarItemAlias.upsertMapping(
      canonicalName,
      aliases,
      userId,
      { description, autoMerge }
    );
    return mapping;
  }
  async updateMapping(mappingId, updates, userId) {
    const { canonicalName, aliases, description, autoMerge, isActive } = updates;
    const mapping = await RouteStarItemAlias.findById(mappingId);
    if (!mapping) {
      throw new Error('Mapping not found');
    }
    if (canonicalName !== undefined) mapping.canonicalName = canonicalName;
    if (aliases !== undefined) {
      mapping.aliases = aliases.map(a => typeof a === 'string' ? { name: a } : a);
    }
    if (description !== undefined) mapping.description = description;
    if (autoMerge !== undefined) mapping.autoMerge = autoMerge;
    if (isActive !== undefined) mapping.isActive = isActive;
    mapping.lastUpdatedBy = userId;
    await mapping.save();
    return mapping;
  }
  async addAlias(mappingId, aliasData) {
    const { aliasName, notes } = aliasData;
    if (!aliasName) {
      throw new Error('Alias name is required');
    }
    const mapping = await RouteStarItemAlias.findById(mappingId);
    if (!mapping) {
      throw new Error('Mapping not found');
    }
    await mapping.addAlias(aliasName, notes);
    return mapping;
  }
  async removeAlias(mappingId, aliasName) {
    const mapping = await RouteStarItemAlias.findById(mappingId);
    if (!mapping) {
      throw new Error('Mapping not found');
    }
    await mapping.removeAlias(decodeURIComponent(aliasName));
    return mapping;
  }
  async deleteMapping(mappingId) {
    const mapping = await RouteStarItemAlias.findByIdAndDelete(mappingId);
    if (!mapping) {
      throw new Error('Mapping not found');
    }
    return mapping;
  }
  async getLookupMap() {
    const lookupMap = await RouteStarItemAlias.buildLookupMap();
    return {
      lookupMap,
      totalAliases: Object.keys(lookupMap).length
    };
  }
  async getSuggestedMappings() {
    const suggestions = await RouteStarItemAlias.getSuggestedMappings();
    const grouped = {};
    suggestions.forEach(item => {
      const normalized = item.itemName.replace(/[\s\-_]/g, '').toUpperCase();
      if (!grouped[normalized]) {
        grouped[normalized] = {
          suggestedCanonical: item.itemName,
          variations: []
        };
      }
      grouped[normalized].variations.push(item);
    });
    const groupsWithVariations = Object.entries(grouped)
      .filter(([_, group]) => group.variations.length > 1)
      .map(([normalized, group]) => ({
        normalized,
        ...group
      }));
    return {
      suggestions: suggestions,
      groupedSuggestions: groupsWithVariations,
      totalUnmapped: suggestions.length,
      potentialGroups: groupsWithVariations.length
    };
  }
  async getStats() {
    const [totalMappings, activeMappings, lookupMap, uniqueItemsCount] = await Promise.all([
      RouteStarItemAlias.countDocuments(),
      RouteStarItemAlias.countDocuments({ isActive: true }),
      RouteStarItemAlias.buildLookupMap(),
      RouteStarItem.countDocuments()
    ]);
    const totalAliases = Object.keys(lookupMap).length;
    const unmappedItems = uniqueItemsCount - totalAliases;
    return {
      totalMappings,
      activeMappings,
      totalAliases,
      totalUniqueItems: uniqueItemsCount,
      mappedItems: totalAliases,
      unmappedItems: Math.max(0, unmappedItems)
    };
  }
  async getPageDataOptimized() {
    const CustomerConnectOrder = require('../models/CustomerConnectOrder');
    const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');

    const [mappings, routeStarItems, lookupMap, totalMappings, activeMappings, modelCategoryMappings, orderItemNames, manualPOItems] = await Promise.all([
      RouteStarItemAlias.getAllActiveMappings(),
      RouteStarItem.find()
        .select('itemName itemParent description qtyOnHand')
        .sort({ itemName: 1 })
        .lean(),
      RouteStarItemAlias.buildLookupMap(),
      RouteStarItemAlias.countDocuments(),
      RouteStarItemAlias.countDocuments({ isActive: true }),
      ModelCategory.find().select('categoryItemName').lean(),
      CustomerConnectOrder.aggregate([
        { $unwind: '$items' },
        { $group: { _id: '$items.name' } },
        { $project: { _id: 0, name: '$_id' } }
      ]),
      ManualPurchaseOrderItem.find({ isActive: true })
        .select('name sku')
        .lean()
    ]);

    // Create a Set of RouteStarItem names that are already mapped in ModelCategory
    const mappedInModelCategory = new Set(
      modelCategoryMappings
        .filter(mc => mc.categoryItemName)
        .map(mc => mc.categoryItemName.toLowerCase())
    );

    // Filter out items that are already mapped in ModelCategory
    const availableRouteStarItems = routeStarItems.filter(item =>
      !mappedInModelCategory.has(item.itemName.toLowerCase())
    );

    // Build a Set of all RouteStarItem names (lowercase) to avoid duplicates
    const routeStarItemNamesSet = new Set(
      routeStarItems.map(item => item.itemName.toLowerCase())
    );

    // Collect purchased item names that are NOT already in RouteStarItems
    const purchasedItems = [];
    const seenPurchasedNames = new Set();

    for (const orderItem of orderItemNames) {
      if (orderItem.name) {
        const nameLower = orderItem.name.toLowerCase().trim();
        if (!routeStarItemNamesSet.has(nameLower) && !seenPurchasedNames.has(nameLower)) {
          seenPurchasedNames.add(nameLower);
          purchasedItems.push({
            itemName: orderItem.name,
            itemParent: 'CustomerConnect Order',
            description: null,
            qtyOnHand: 0
          });
        }
      }
    }

    for (const poItem of manualPOItems) {
      if (poItem.name) {
        const nameLower = poItem.name.toLowerCase().trim();
        if (!routeStarItemNamesSet.has(nameLower) && !seenPurchasedNames.has(nameLower)) {
          seenPurchasedNames.add(nameLower);
          purchasedItems.push({
            itemName: poItem.name,
            itemParent: `Manual PO (${poItem.sku})`,
            description: null,
            qtyOnHand: 0
          });
        }
      }
    }

    // Combine RouteStarItems + purchased items
    const allAvailableItems = [...availableRouteStarItems, ...purchasedItems];

    const itemsWithMappingStatus = allAvailableItems.map(item => ({
      itemName: item.itemName,
      itemParent: item.itemParent,
      description: item.description,
      qtyOnHand: item.qtyOnHand || 0,
      isMapped: !!lookupMap[item.itemName.toLowerCase()],
      canonicalName: lookupMap[item.itemName.toLowerCase()] || null,
      occurrences: 1,
      totalQuantity: item.qtyOnHand || 0
    }));

    // Sort alphabetically
    itemsWithMappingStatus.sort((a, b) => a.itemName.localeCompare(b.itemName, undefined, { sensitivity: 'base' }));

    const totalAliases = Object.keys(lookupMap).length;
    const mappedItemsCount = itemsWithMappingStatus.filter(i => i.isMapped).length;
    const unmappedItemsCount = itemsWithMappingStatus.filter(i => !i.isMapped).length;
    const stats = {
      totalMappings,
      activeMappings,
      totalAliases,
      totalUniqueItems: allAvailableItems.length,
      mappedItems: mappedItemsCount,
      unmappedItems: unmappedItemsCount,
      excludedByModelMapping: mappedInModelCategory.size
    };
    return {
      mappings: {
        mappings,
        total: mappings.length
      },
      uniqueItems: {
        items: itemsWithMappingStatus,
        stats: {
          totalUniqueItems: allAvailableItems.length,
          mappedItems: mappedItemsCount,
          unmappedItems: unmappedItemsCount
        }
      },
      stats
    };
  }
}
module.exports = new RouteStarItemAliasService();
