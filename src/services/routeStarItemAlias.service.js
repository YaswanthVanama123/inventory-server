const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const RouteStarItem = require('../models/RouteStarItem');


class RouteStarItemAliasService {
  async getAllMappings() {
    const mappings = await RouteStarItemAlias.getAllActiveMappings();
    return {
      mappings,
      total: mappings.length
    };
  }
  async getUniqueItems() {
    const routeStarItems = await RouteStarItem.find()
      .select('itemName itemParent description qtyOnHand')
      .sort({ itemName: 1 })
      .lean();
    console.log(`[unique-items] Found ${routeStarItems.length} RouteStarItems`);
    const lookupMap = await RouteStarItemAlias.buildLookupMap();
    const itemsWithMappingStatus = routeStarItems.map(item => ({
      itemName: item.itemName,
      itemParent: item.itemParent,
      description: item.description,
      qtyOnHand: item.qtyOnHand || 0,
      isMapped: !!lookupMap[item.itemName.toLowerCase()],
      canonicalName: lookupMap[item.itemName.toLowerCase()] || null,
      occurrences: 1,
      totalQuantity: item.qtyOnHand || 0
    }));
    const stats = {
      totalUniqueItems: routeStarItems.length,
      mappedItems: itemsWithMappingStatus.filter(i => i.isMapped).length,
      unmappedItems: itemsWithMappingStatus.filter(i => !i.isMapped).length
    };
    console.log(`[unique-items] Stats:`, stats);
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
    const [mappings, routeStarItems, lookupMap, totalMappings, activeMappings] = await Promise.all([
      RouteStarItemAlias.getAllActiveMappings(),
      RouteStarItem.find()
        .select('itemName itemParent description qtyOnHand')
        .sort({ itemName: 1 })
        .lean(),
      RouteStarItemAlias.buildLookupMap(),
      RouteStarItemAlias.countDocuments(),
      RouteStarItemAlias.countDocuments({ isActive: true })
    ]);
    console.log(`[page-data-optimized] Found ${routeStarItems.length} RouteStarItems, ${mappings.length} mappings`);
    const itemsWithMappingStatus = routeStarItems.map(item => ({
      itemName: item.itemName,
      itemParent: item.itemParent,
      description: item.description,
      qtyOnHand: item.qtyOnHand || 0,
      isMapped: !!lookupMap[item.itemName.toLowerCase()],
      canonicalName: lookupMap[item.itemName.toLowerCase()] || null,
      occurrences: 1,
      totalQuantity: item.qtyOnHand || 0
    }));
    const totalAliases = Object.keys(lookupMap).length;
    const mappedItemsCount = itemsWithMappingStatus.filter(i => i.isMapped).length;
    const unmappedItemsCount = itemsWithMappingStatus.filter(i => !i.isMapped).length;
    const stats = {
      totalMappings,
      activeMappings,
      totalAliases,
      totalUniqueItems: routeStarItems.length,
      mappedItems: mappedItemsCount,
      unmappedItems: unmappedItemsCount
    };
    console.log(`[page-data-optimized] Stats:`, stats);
    return {
      mappings: {
        mappings,
        total: mappings.length
      },
      uniqueItems: {
        items: itemsWithMappingStatus,
        stats: {
          totalUniqueItems: routeStarItems.length,
          mappedItems: mappedItemsCount,
          unmappedItems: unmappedItemsCount
        }
      },
      stats
    };
  }
}
module.exports = new RouteStarItemAliasService();
