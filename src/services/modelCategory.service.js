const ModelCategory = require('../models/ModelCategory');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const RouteStarItem = require('../models/RouteStarItem');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');


class ModelCategoryService {
  async getUniqueModels(options = {}) {
    const ccOrderItems = await CustomerConnectOrder.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.sku',
          orderItemName: { $first: '$items.name' },
          source: { $first: 'customerconnect' }
        }
      },
      {
        $project: {
          _id: 0,
          modelNumber: '$_id',
          orderItemName: 1,
          source: 1
        }
      }
    ]).allowDiskUse(true);

    const manualPOItems = await ManualPurchaseOrderItem.find({ isActive: true })
      .select('sku name mappedCategoryItemName mappedCategoryItemId')
      .lean();

    const modelsMap = new Map();

    for (const item of ccOrderItems) {
      modelsMap.set(item.modelNumber, {
        modelNumber: item.modelNumber,
        orderItemName: item.orderItemName,
        source: 'customerconnect'
      });
    }

    const manualMappingLookup = new Map();

    for (const item of manualPOItems) {
      if (item.mappedCategoryItemName) {
        manualMappingLookup.set((item.sku || '').toUpperCase(), {
          categoryItemName: item.mappedCategoryItemName,
          categoryItemId: item.mappedCategoryItemId
        });
      }
      if (modelsMap.has(item.sku)) {
        const existing = modelsMap.get(item.sku);
        existing.source = 'both';
      } else {
        modelsMap.set(item.sku, {
          modelNumber: item.sku,
          orderItemName: item.name,
          source: 'manual'
        });
      }
    }

    const allModels = Array.from(modelsMap.values());

    const mappings = await ModelCategory.find({
      modelNumber: { $in: allModels.map(m => m.modelNumber) }
    }).lean();

    const mappingLookup = new Map();
    for (const mapping of mappings) {
      mappingLookup.set(mapping.modelNumber, mapping);
    }

    const result = allModels.map(model => {
      const mapping = mappingLookup.get(model.modelNumber);
      const manualMapping = manualMappingLookup.get((model.modelNumber || '').toUpperCase());
      return {
        modelNumber: model.modelNumber,
        orderItemName: model.orderItemName,
        source: model.source,
        categoryItemName: mapping?.categoryItemName || manualMapping?.categoryItemName || null,
        categoryItemId: mapping?.categoryItemId || manualMapping?.categoryItemId || null,
        notes: mapping?.notes || ''
      };
    });

    result.sort((a, b) => a.modelNumber.localeCompare(b.modelNumber));

    const { search, status } = options;
    let filtered = result;

    if (search && String(search).trim()) {
      const term = String(search).toLowerCase().trim();
      filtered = filtered.filter(m =>
        (m.modelNumber || '').toLowerCase().includes(term) ||
        (m.orderItemName || '').toLowerCase().includes(term) ||
        (m.categoryItemName || '').toLowerCase().includes(term)
      );
    }

    if (status === 'mapped') {
      filtered = filtered.filter(m => m.categoryItemName);
    } else if (status === 'unmapped') {
      filtered = filtered.filter(m => !m.categoryItemName);
    }

    const mappedCount = result.filter(m => m.categoryItemName).length;
    const stats = {
      total: result.length,
      mapped: mappedCount,
      unmapped: result.length - mappedCount
    };

    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.max(1, parseInt(options.limit, 10) || 20);
    const filteredTotal = filtered.length;
    const totalPages = Math.max(1, Math.ceil(filteredTotal / limit));
    const start = (page - 1) * limit;
    const pageItems = filtered.slice(start, start + limit);

    return {
      models: pageItems,
      stats,
      pagination: {
        total: filteredTotal,
        page,
        limit,
        totalPages
      },
      total: filteredTotal
    };
  }
  async getRouteStarItems() {
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

    await ManualPurchaseOrderItem.findOneAndUpdate(
      { sku: modelNumber.toUpperCase() },
      {
        mappedCategoryItemId: categoryItemId || null,
        mappedCategoryItemName: categoryItemName || null,
        lastUpdatedBy: userId
      }
    );

    return mapping;
  }
  async deleteMapping(modelNumber) {
    const result = await ModelCategory.findOneAndDelete({
      modelNumber: modelNumber.toUpperCase()
    });
    if (!result) {
      throw new Error('Mapping not found');
    }
    await ManualPurchaseOrderItem.findOneAndUpdate(
      { sku: modelNumber.toUpperCase() },
      { mappedCategoryItemId: null, mappedCategoryItemName: null }
    );
    return result;
  }
  async getAllMappings(search) {
    let mappings = await ModelCategory.getAllMappings();
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      mappings = mappings.filter(m => {
        const modelNumber = (m.modelNumber || '').toLowerCase();
        const categoryItemName = (m.categoryItemName || '').toLowerCase();
        const populatedItemName = (m.categoryItemId && m.categoryItemId.itemName
          ? m.categoryItemId.itemName
          : '').toLowerCase();
        return modelNumber.includes(term)
          || categoryItemName.includes(term)
          || populatedItemName.includes(term);
      });
    }
    return {
      mappings,
      total: mappings.length
    };
  }
}
module.exports = new ModelCategoryService();
