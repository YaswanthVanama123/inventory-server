const ModelCategory = require('../models/ModelCategory');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarItem = require('../models/RouteStarItem');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');


class ModelCategoryService {
  async getUniqueModels() {
    const result = await CustomerConnectOrder.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.sku',
          orderItemName: { $first: '$items.name' }
        }
      },
      {
        $lookup: {
          from: 'modelcategories',
          localField: '_id',
          foreignField: 'modelNumber',
          as: 'mapping'
        }
      },
      {
        $unwind: {
          path: '$mapping',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 0,
          modelNumber: '$_id',
          orderItemName: 1,
          categoryItemName: { $ifNull: ['$mapping.categoryItemName', null] },
          categoryItemId: { $ifNull: ['$mapping.categoryItemId', null] },
          notes: { $ifNull: ['$mapping.notes', ''] }
        }
      },
      { $sort: { modelNumber: 1 } }
    ]).allowDiskUse(true);
    return {
      models: result,
      total: result.length
    };
  }
  async getRouteStarItems() {
    // Fetch both canonical mappings and all RouteStarItems in parallel
    const [allMappings, allRouteStarItems] = await Promise.all([
      RouteStarItemAlias.find({ isActive: true })
        .select('_id canonicalName description aliases')
        .sort({ canonicalName: 1 })
        .lean(),
      RouteStarItem.find()
        .select('_id itemName itemParent description')
        .sort({ itemName: 1 })
        .lean()
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

    return {
      items: allItems,
      total: allItems.length
    };
  }
  async saveMapping(mappingData, userId) {
    const { modelNumber, categoryItemName, categoryItemId, notes } = mappingData;
    if (!modelNumber) {
      throw new Error('Model number is required');
    }
    const mapping = await ModelCategory.upsertMapping(
      modelNumber,
      categoryItemName,
      categoryItemId,
      userId
    );
    if (notes !== undefined) {
      mapping.notes = notes;
      await mapping.save();
    }
    return mapping;
  }
  async deleteMapping(modelNumber) {
    const result = await ModelCategory.findOneAndDelete({
      modelNumber: modelNumber.toUpperCase()
    });
    if (!result) {
      throw new Error('Mapping not found');
    }
    return result;
  }
  async getAllMappings() {
    const mappings = await ModelCategory.getAllMappings();
    return {
      mappings,
      total: mappings.length
    };
  }
}
module.exports = new ModelCategoryService();
