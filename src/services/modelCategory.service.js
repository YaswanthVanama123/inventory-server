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
    const allItems = await RouteStarItem.find()
      .select('itemName itemParent description')
      .sort({ itemName: 1 })
      .lean();
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
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
    const mergedItems = Object.values(groupedByCanonical).sort((a, b) =>
      a.itemName.localeCompare(b.itemName)
    );
    return {
      items: mergedItems,
      total: mergedItems.length
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
