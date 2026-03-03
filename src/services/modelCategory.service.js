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
   */
  async getUniqueModels() {
    // Get SKUs with names from orders
    const skuWithNames = await CustomerConnectOrder.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            sku: '$items.sku',
            name: '$items.name'
          },
          orderItemName: { $first: '$items.name' }
        }
      },
      {
        $project: {
          _id: 0,
          sku: '$_id.sku',
          orderItemName: 1
        }
      }
    ]);

    const uniqueSKUs = skuWithNames.map(item => item.sku);

    // Get existing mappings
    const mappings = await ModelCategory.find({
      modelNumber: { $in: uniqueSKUs }
    }).lean();

    // Create mappings map
    const mappingsMap = {};
    mappings.forEach(mapping => {
      mappingsMap[mapping.modelNumber] = {
        categoryItemName: mapping.categoryItemName,
        categoryItemId: mapping.categoryItemId,
        notes: mapping.notes
      };
    });

    // Create order item names map
    const orderItemNamesMap = {};
    skuWithNames.forEach(item => {
      orderItemNamesMap[item.sku] = item.orderItemName;
    });

    // Combine data
    const models = uniqueSKUs.map(sku => ({
      modelNumber: sku,
      orderItemName: orderItemNamesMap[sku] || null,
      categoryItemName: mappingsMap[sku]?.categoryItemName || null,
      categoryItemId: mappingsMap[sku]?.categoryItemId || null,
      notes: mappingsMap[sku]?.notes || ''
    })).sort((a, b) => a.modelNumber.localeCompare(b.modelNumber));

    return {
      models,
      total: models.length
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
