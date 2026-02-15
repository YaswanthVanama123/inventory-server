const express = require('express');
const router = express.Router();
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * @route   GET /api/routestar-item-alias/mappings
 * @desc    Get all item name mappings
 * @access  Private
 */
router.get('/mappings', authenticate, async (req, res) => {
  try {
    const mappings = await RouteStarItemAlias.getAllActiveMappings();

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

/**
 * @route   GET /api/routestar-item-alias/unique-items
 * @desc    Get all unique item names from RouteStarItem collection
 * @access  Private
 */
router.get('/unique-items', authenticate, async (req, res) => {
  try {
    const RouteStarItem = require('../models/RouteStarItem');

    // Get all RouteStarItems
    const routeStarItems = await RouteStarItem.find()
      .select('itemName itemParent description qtyOnHand')
      .sort({ itemName: 1 })
      .lean();

    console.log(`[unique-items] Found ${routeStarItems.length} RouteStarItems`);

    // Get existing mappings to check which items are already mapped
    const lookupMap = await RouteStarItemAlias.buildLookupMap();

    // Transform to match frontend expectations
    const itemsWithMappingStatus = routeStarItems.map(item => ({
      itemName: item.itemName,
      itemParent: item.itemParent,
      description: item.description,
      qtyOnHand: item.qtyOnHand || 0,
      isMapped: !!lookupMap[item.itemName],
      canonicalName: lookupMap[item.itemName] || null,
      // Add some stats for display
      occurrences: 1, // Each RouteStarItem appears once in the master list
      totalQuantity: item.qtyOnHand || 0
    }));

    // Calculate statistics
    const stats = {
      totalUniqueItems: routeStarItems.length,
      mappedItems: itemsWithMappingStatus.filter(i => i.isMapped).length,
      unmappedItems: itemsWithMappingStatus.filter(i => !i.isMapped).length
    };

    console.log(`[unique-items] Stats:`, stats);

    res.json({
      success: true,
      data: {
        items: itemsWithMappingStatus,
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching unique items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unique items',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/routestar-item-alias/mapping
 * @desc    Create or update an item name mapping
 * @access  Private (Admin only)
 */
router.post('/mapping', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { canonicalName, aliases, description, autoMerge = true } = req.body;

    if (!canonicalName || !aliases || !Array.isArray(aliases) || aliases.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Canonical name and at least one alias are required'
      });
    }

    // Check if any alias is already mapped to a different canonical name
    const existingMappings = await RouteStarItemAlias.find({
      'aliases.name': { $in: aliases.map(a => typeof a === 'string' ? a : a.name) },
      canonicalName: { $ne: canonicalName },
      isActive: true
    });

    if (existingMappings.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Some aliases are already mapped to different canonical names: ${existingMappings.map(m => m.canonicalName).join(', ')}`,
        conflictingMappings: existingMappings
      });
    }

    const mapping = await RouteStarItemAlias.upsertMapping(
      canonicalName,
      aliases,
      req.user._id,
      { description, autoMerge }
    );

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
 * @route   PUT /api/routestar-item-alias/mapping/:id
 * @desc    Update an existing mapping
 * @access  Private (Admin only)
 */
router.put('/mapping/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const { canonicalName, aliases, description, autoMerge, isActive } = req.body;

    const mapping = await RouteStarItemAlias.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Mapping not found'
      });
    }

    // Update fields
    if (canonicalName !== undefined) mapping.canonicalName = canonicalName;
    if (aliases !== undefined) {
      mapping.aliases = aliases.map(a => typeof a === 'string' ? { name: a } : a);
    }
    if (description !== undefined) mapping.description = description;
    if (autoMerge !== undefined) mapping.autoMerge = autoMerge;
    if (isActive !== undefined) mapping.isActive = isActive;
    mapping.lastUpdatedBy = req.user._id;

    await mapping.save();

    res.json({
      success: true,
      message: 'Mapping updated successfully',
      data: mapping
    });
  } catch (error) {
    console.error('Error updating mapping:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update mapping',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/routestar-item-alias/mapping/:id/add-alias
 * @desc    Add an alias to an existing mapping
 * @access  Private (Admin only)
 */
router.post('/mapping/:id/add-alias', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const { aliasName, notes } = req.body;

    if (!aliasName) {
      return res.status(400).json({
        success: false,
        message: 'Alias name is required'
      });
    }

    const mapping = await RouteStarItemAlias.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Mapping not found'
      });
    }

    await mapping.addAlias(aliasName, notes);

    res.json({
      success: true,
      message: 'Alias added successfully',
      data: mapping
    });
  } catch (error) {
    console.error('Error adding alias:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add alias',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/routestar-item-alias/mapping/:id/alias/:aliasName
 * @desc    Remove an alias from a mapping
 * @access  Private (Admin only)
 */
router.delete('/mapping/:id/alias/:aliasName', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { id, aliasName } = req.params;

    const mapping = await RouteStarItemAlias.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Mapping not found'
      });
    }

    await mapping.removeAlias(decodeURIComponent(aliasName));

    res.json({
      success: true,
      message: 'Alias removed successfully',
      data: mapping
    });
  } catch (error) {
    console.error('Error removing alias:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove alias',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/routestar-item-alias/mapping/:id
 * @desc    Delete a mapping
 * @access  Private (Admin only)
 */
router.delete('/mapping/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;

    const mapping = await RouteStarItemAlias.findByIdAndDelete(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Mapping not found'
      });
    }

    res.json({
      success: true,
      message: 'Mapping deleted successfully',
      data: mapping
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
 * @route   GET /api/routestar-item-alias/lookup-map
 * @desc    Get alias -> canonical name lookup map
 * @access  Private
 */
router.get('/lookup-map', authenticate, async (req, res) => {
  try {
    const lookupMap = await RouteStarItemAlias.buildLookupMap();

    res.json({
      success: true,
      data: {
        lookupMap,
        totalAliases: Object.keys(lookupMap).length
      }
    });
  } catch (error) {
    console.error('Error building lookup map:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to build lookup map',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/routestar-item-alias/suggested-mappings
 * @desc    Get suggested mappings based on similar item names from RouteStarItem
 * @access  Private
 */
router.get('/suggested-mappings', authenticate, async (req, res) => {
  try {
    const suggestions = await RouteStarItemAlias.getSuggestedMappings();

    // Group similar names (basic implementation - can be enhanced with fuzzy matching)
    const grouped = {};

    suggestions.forEach(item => {
      // Normalize name for grouping (remove spaces, hyphens, convert to uppercase)
      const normalized = item.itemName.replace(/[\s\-_]/g, '').toUpperCase();

      if (!grouped[normalized]) {
        grouped[normalized] = {
          suggestedCanonical: item.itemName,
          variations: []
        };
      }

      grouped[normalized].variations.push(item);
    });

    // Filter to only show groups with multiple variations
    // For RouteStarItem, this will show items that have similar normalized names
    const groupsWithVariations = Object.entries(grouped)
      .filter(([_, group]) => group.variations.length > 1)
      .map(([normalized, group]) => ({
        normalized,
        ...group
      }));

    res.json({
      success: true,
      data: {
        suggestions: suggestions,
        groupedSuggestions: groupsWithVariations,
        totalUnmapped: suggestions.length,
        potentialGroups: groupsWithVariations.length
      }
    });
  } catch (error) {
    console.error('Error getting suggested mappings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get suggested mappings',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/routestar-item-alias/stats
 * @desc    Get statistics about mappings
 * @access  Private
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const RouteStarItem = require('../models/RouteStarItem');

    const [totalMappings, activeMappings, lookupMap, uniqueItemsCount] = await Promise.all([
      RouteStarItemAlias.countDocuments(),
      RouteStarItemAlias.countDocuments({ isActive: true }),
      RouteStarItemAlias.buildLookupMap(),
      RouteStarItem.countDocuments()
    ]);

    const totalAliases = Object.keys(lookupMap).length;
    const unmappedItems = uniqueItemsCount - totalAliases;

    res.json({
      success: true,
      data: {
        totalMappings,
        activeMappings,
        totalAliases,
        totalUniqueItems: uniqueItemsCount,
        mappedItems: totalAliases,
        unmappedItems: Math.max(0, unmappedItems)
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

module.exports = router;
