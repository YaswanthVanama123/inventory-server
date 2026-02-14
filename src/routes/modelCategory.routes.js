const express = require('express');
const router = express.Router();
const ModelCategory = require('../models/ModelCategory');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarItem = require('../models/RouteStarItem');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /api/model-category/unique-models
 * @desc    Get all unique model numbers (SKUs) from CustomerConnectOrders
 */
router.get('/unique-models', authenticate, async (req, res) => {
  try {
    // Use aggregation to get unique SKUs with their item names
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

    // Extract unique SKUs
    const uniqueSKUs = skuWithNames.map(item => item.sku);

    // Get existing mappings
    const mappings = await ModelCategory.find({
      modelNumber: { $in: uniqueSKUs }
    }).lean();

    // Create a map of modelNumber -> mapping data
    const mappingsMap = {};
    mappings.forEach(mapping => {
      mappingsMap[mapping.modelNumber] = {
        categoryItemName: mapping.categoryItemName,
        categoryItemId: mapping.categoryItemId,
        notes: mapping.notes
      };
    });

    // Create a map of sku -> orderItemName
    const orderItemNamesMap = {};
    skuWithNames.forEach(item => {
      orderItemNamesMap[item.sku] = item.orderItemName;
    });

    // Create response with model numbers, order item names, and their current mappings
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

/**
 * @route   GET /api/model-category/routestar-items
 * @desc    Get all RouteStarItem names for dropdown
 */
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

/**
 * @route   POST /api/model-category/mapping
 * @desc    Create or update a model-to-category mapping
 */
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

    // Update notes if provided
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

/**
 * @route   DELETE /api/model-category/mapping/:modelNumber
 * @desc    Delete a model-to-category mapping
 */
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

/**
 * @route   GET /api/model-category/mappings
 * @desc    Get all model-category mappings
 */
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
