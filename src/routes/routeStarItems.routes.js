const express = require('express');
const router = express.Router();
const RouteStarItem = require('../models/RouteStarItem');
const { authenticate } = require('../middleware/auth');

// Sync lock to prevent multiple simultaneous syncs
let isSyncing = false;

/**
 * @route   GET /api/routestar-items/stats
 * @desc    Get statistics about items
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const total = await RouteStarItem.countDocuments();
    const forUseCount = await RouteStarItem.countDocuments({ forUse: true });
    const forSellCount = await RouteStarItem.countDocuments({ forSell: true });
    const bothCount = await RouteStarItem.countDocuments({ forUse: true, forSell: true });
    const unmarkedCount = await RouteStarItem.countDocuments({ forUse: false, forSell: false });

    res.json({
      success: true,
      data: {
        total,
        forUse: forUseCount,
        forSell: forSellCount,
        both: bothCount,
        unmarked: unmarkedCount
      }
    });
  } catch (error) {
    console.error('Error fetching item stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/routestar-items
 * @desc    Get all RouteStarItems with optional filters
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      search,
      itemParent,
      type,
      itemCategory,
      forUse,
      forSell,
      page = 1,
      limit = 50,
      sortBy = 'itemName',
      sortOrder = 'asc'
    } = req.query;

    // Build query
    const query = {};

    // Search filter (item name, parent, description)
    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { itemParent: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Item parent filter
    if (itemParent && itemParent !== 'all') {
      query.itemParent = itemParent;
    }

    // Type filter
    if (type && type !== 'all') {
      query.type = type;
    }

    // For use filter
    if (forUse === 'true') {
      query.forUse = true;
    }

    // For sell filter
    if (forSell === 'true') {
      query.forSell = true;
    }

    // Item category filter
    if (itemCategory && itemCategory !== 'all') {
      query.itemCategory = itemCategory;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Execute query
    const items = await RouteStarItem.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await RouteStarItem.countDocuments(query);

    // Get unique item parents for filter dropdown
    const itemParents = await RouteStarItem.distinct('itemParent');

    // Get unique types for filter dropdown
    const types = await RouteStarItem.distinct('type');

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        },
        filters: {
          itemParents: itemParents.filter(p => p).sort(),
          types: types.filter(t => t).sort()
        }
      }
    });
  } catch (error) {
    console.error('Error fetching RouteStarItems:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items',
      error: error.message
    });
  }
});

/**
 * @route   PATCH /api/routestar-items/:id/flags
 * @desc    Update forUse and forSell flags for an item
 */
router.patch('/:id/flags', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { forUse, forSell, itemCategory } = req.body;

    const item = await RouteStarItem.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Update flags
    if (forUse !== undefined) {
      item.forUse = forUse;
    }

    if (forSell !== undefined) {
      item.forSell = forSell;
    }

    // Update item category
    if (itemCategory !== undefined && ['Service', 'Item'].includes(itemCategory)) {
      item.itemCategory = itemCategory;
    }

    await item.save();

    res.json({
      success: true,
      message: 'Item updated successfully',
      data: item
    });
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/routestar-items/all
 * @desc    Delete all RouteStarItems
 */
router.delete('/all', authenticate, async (req, res) => {
  try {
    const result = await RouteStarItem.deleteMany({});

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} items`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Error deleting all items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete items',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/routestar-items/sync
 * @desc    Trigger a sync of items from RouteStar
 */
router.post('/sync', authenticate, async (req, res) => {
  // Check if sync is already in progress
  if (isSyncing) {
    return res.status(409).json({
      success: false,
      message: 'Sync already in progress. Please wait for the current sync to complete.',
      error: 'SYNC_IN_PROGRESS'
    });
  }

  // Set sync lock
  isSyncing = true;

  try {
    const RouteStarSyncService = require('../services/routeStarSync.service');
    const syncService = new RouteStarSyncService();

    // Initialize the service
    await syncService.init();

    // Sync items (fetch all)
    const result = await syncService.syncItems(Infinity);

    // Close the service
    await syncService.close();

    res.json({
      success: true,
      message: 'Items synced successfully',
      data: result
    });
  } catch (error) {
    console.error('Error syncing items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync items',
      error: error.message
    });
  } finally {
    // Always release the lock
    isSyncing = false;
  }
});

module.exports = router;
