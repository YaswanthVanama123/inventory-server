const ModelCategory = require('../models/ModelCategory');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarItem = require('../models/RouteStarItem');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');

/**
 * Model Category Service
 * Handles all business logic for model category mapping operations
 */
class ModelCategoryService {
  /**
   * Get unique models from orders with mapping status
   * OPTIMIZED: Single aggregation pipeline with $lookup (no caching)
   */
  async getUniqueModels() {
    // Use single optimized aggregation pipeline with $lookup to join with ModelCategory
    const result = await CustomerConnectOrder.aggregate([
      // Unwind items array
      { $unwind: '$items' },

      // Group by SKU to get unique models with first occurrence name
      {
        $group: {
          _id: '$items.sku',
          orderItemName: { $first: '$items.name' }
        }
      },

      // Lookup mapping from ModelCategory collection
      {
        $lookup: {
          from: 'modelcategories',
          localField: '_id',
          foreignField: 'modelNumber',
          as: 'mapping'
        }
      },

      // Unwind mapping (left join - keep items without mapping)
      {
        $unwind: {
          path: '$mapping',
          preserveNullAndEmptyArrays: true
        }
      },

      // Project final shape with only needed fields
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

      // Sort by model number
      { $sort: { modelNumber: 1 } }
    ]).allowDiskUse(true);

    return {
      models: result,
      total: result.length
    };
  }

  /**
   * Get RouteStarItems with mapping status
   */
  async getRouteStarItems() {
    // Fetch all RouteStarItems
    const allItems = await RouteStarItem.find()
      .select('itemName itemParent description')
      .sort({ itemName: 1 })
      .lean();

    // Load the alias lookup map
    const aliasMap = await RouteStarItemAlias.buildLookupMap();

    // Group items by canonical names (merge variations)
    const groupedByCanonical = {};

    allItems.forEach(item => {
      const canonicalName = aliasMap[item.itemName] || item.itemName;

      if (!groupedByCanonical[canonicalName]) {
        groupedByCanonical[canonicalName] = {
          _id: item._id,
          itemName: canonicalName,
          itemParent: item.itemParent,
          description: item.description,
          isMapped: !!aliasMap[item.itemName],
          mergedCount: 0,
          variations: []
        };
      }

      groupedByCanonical[canonicalName].mergedCount++;
      groupedByCanonical[canonicalName].variations.push(item.itemName);
    });

    // Convert to array and sort by itemName
    const mergedItems = Object.values(groupedByCanonical).sort((a, b) =>
      a.itemName.localeCompare(b.itemName)
    );

    return {
      items: mergedItems,
      total: mergedItems.length
    };
  }

  /**
   * Create or update a model category mapping
   */
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

    // Update notes if provided
    if (notes !== undefined) {
      mapping.notes = notes;
      await mapping.save();
    }

    return mapping;
  }

  /**
   * Delete a model category mapping
   */
  async deleteMapping(modelNumber) {
    const result = await ModelCategory.findOneAndDelete({
      modelNumber: modelNumber.toUpperCase()
    });

    if (!result) {
      throw new Error('Mapping not found');
    }

    return result;
  }

  /**
   * Get all model category mappings
   */
  async getAllMappings() {
    const mappings = await ModelCategory.getAllMappings();

    return {
      mappings,
      total: mappings.length
    };
  }
}

module.exports = new ModelCategoryService();
