const express = require('express');
const router = express.Router();
const ModelCategory = require('../models/ModelCategory');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarItem = require('../models/RouteStarItem');
const { authenticate } = require('../middleware/auth');





router.get('/unique-models', authenticate, async (req, res) => {
  try {
    
    const skuWithNames = await CustomerConnectOrder.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.sku',
          orderItemName: { $first: '$items.name' }
        }
      },
      {
        $project: {
          _id: 0,
          sku: '$_id',
          orderItemName: 1
        }
      }
    ]);

    
    const uniqueSKUs = skuWithNames.map(item => item.sku);

    
    const mappings = await ModelCategory.find({
      modelNumber: { $in: uniqueSKUs }
    }).lean();

    
    const mappingsMap = {};
    mappings.forEach(mapping => {
      mappingsMap[mapping.modelNumber] = {
        categoryItemName: mapping.categoryItemName,
        categoryItemId: mapping.categoryItemId,
        notes: mapping.notes
      };
    });

    
    const orderItemNamesMap = {};
    skuWithNames.forEach(item => {
      orderItemNamesMap[item.sku] = item.orderItemName;
    });

    
    const models = uniqueSKUs.map(sku => ({
      modelNumber: sku,
      orderItemName: orderItemNamesMap[sku] || null,
      categoryItemName: mappingsMap[sku]?.categoryItemName || null,
      categoryItemId: mappingsMap[sku]?.categoryItemId || null,
      notes: mappingsMap[sku]?.notes || ''
    })).sort((a, b) => a.modelNumber.localeCompare(b.modelNumber));

    res.json({
      success: true,
      data: {
        models,
        total: models.length
      }
    });
  } catch (error) {
    console.error('Error fetching unique models:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unique model numbers',
      error: error.message
    });
  }
});





router.get('/routestar-items', authenticate, async (req, res) => {
  try {
    const items = await RouteStarItem.find()
      .select('itemName itemParent description')
      .sort({ itemName: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        items,
        total: items.length
      }
    });
  } catch (error) {
    console.error('Error fetching RouteStarItems:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch RouteStar items',
      error: error.message
    });
  }
});





router.post('/mapping', authenticate, async (req, res) => {
  try {
    const { modelNumber, categoryItemName, categoryItemId, notes } = req.body;

    if (!modelNumber) {
      return res.status(400).json({
        success: false,
        message: 'Model number is required'
      });
    }

    const mapping = await ModelCategory.upsertMapping(
      modelNumber,
      categoryItemName,
      categoryItemId,
      req.user._id
    );

    
    if (notes !== undefined) {
      mapping.notes = notes;
      await mapping.save();
    }

    res.json({
      success: true,
      message: 'Mapping saved successfully',
      data: mapping
    });
  } catch (error) {
    console.error('Error saving mapping:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save mapping',
      error: error.message
    });
  }
});





router.delete('/mapping/:modelNumber', authenticate, async (req, res) => {
  try {
    const { modelNumber } = req.params;

    const result = await ModelCategory.findOneAndDelete({
      modelNumber: modelNumber.toUpperCase()
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Mapping not found'
      });
    }

    res.json({
      success: true,
      message: 'Mapping deleted successfully',
      data: result
    });
  } catch (error) {
    console.error('Error deleting mapping:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete mapping',
      error: error.message
    });
  }
});





router.get('/mappings', authenticate, async (req, res) => {
  try {
    const mappings = await ModelCategory.getAllMappings();

    res.json({
      success: true,
      data: {
        mappings,
        total: mappings.length
      }
    });
  } catch (error) {
    console.error('Error fetching mappings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch mappings',
      error: error.message
    });
  }
});

module.exports = router;
