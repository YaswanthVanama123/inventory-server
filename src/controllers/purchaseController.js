const Purchase = require('../models/Purchase');
const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');
const StockMovement = require('../models/StockMovement');
const PurchaseOrder = require('../models/PurchaseOrder');

const createPurchase = async (req, res, next) => {
  try {
    const { inventoryId } = req.params;
    const {
      purchaseDate,
      quantity,
      purchasePrice,
      sellingPrice: providedSellingPrice,
      supplier,
      batchNumber,
      expiryDate,
      notes,
      invoiceNumber,
      syncMetadata
    } = req.body;

    const inventoryItem = await Inventory.findOne({ _id: inventoryId, isDeleted: false });

    if (!inventoryItem) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'INVENTORY_NOT_FOUND'
        }
      });
    }

    const totalCost = quantity * purchasePrice;

    
    let sellingPrice = providedSellingPrice || purchasePrice;
    if (!providedSellingPrice && inventoryItem.profitSettings) {
      const { profitType, profitValue } = inventoryItem.profitSettings;
      if (profitType === 'percentage') {
        sellingPrice = purchasePrice + (purchasePrice * profitValue / 100);
      } else if (profitType === 'fixed') {
        sellingPrice = purchasePrice + profitValue;
      }
    }

    const purchase = await Purchase.create({
      inventoryItem: inventoryId,
      purchaseDate: purchaseDate || Date.now(),
      quantity,
      unit: inventoryItem.quantity.unit,
      purchasePrice,
      sellingPrice,
      totalCost,
      supplier,
      batchNumber,
      expiryDate,
      notes,
      invoiceNumber,
      remainingQuantity: quantity,
      syncMetadata: syncMetadata || {
        source: 'manual',
        isSynced: false
      },
      createdBy: req.user.id,
      lastUpdatedBy: req.user.id
    });

    const previousQuantity = inventoryItem.quantity.current;
    const newQuantity = previousQuantity + quantity;

    inventoryItem.quantity.current = newQuantity;
    inventoryItem.stockHistory.push({
      action: 'added',
      quantity: quantity,
      previousQuantity,
      newQuantity,
      reason: `Purchase added - Batch: ${batchNumber || 'N/A'}, Invoice: ${invoiceNumber || 'N/A'}`,
      updatedBy: req.user.id
    });
    inventoryItem.lastUpdatedBy = req.user.id;

    await inventoryItem.save();

    
    await StockMovement.create({
      sku: inventoryItem.skuCode,
      type: 'IN',
      qty: quantity,
      refType: 'MANUAL',
      refId: purchase._id,
      sourceRef: invoiceNumber || batchNumber,
      timestamp: purchaseDate || Date.now(),
      notes: `Purchase added: ${notes || ''}`,
      createdBy: req.user.id
    });

    await AuditLog.create({
      action: 'CREATE',
      resource: 'PURCHASE',
      resourceId: purchase._id,
      performedBy: req.user.id,
      details: {
        inventoryItem: inventoryItem.itemName,
        quantity,
        purchasePrice,
        totalCost,
        batchNumber,
        source: syncMetadata?.source || 'manual'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    const populatedPurchase = await Purchase.findById(purchase._id)
      .populate('inventoryItem', 'itemName skuCode category')
      .populate('createdBy', 'username fullName');

    res.status(201).json({
      success: true,
      data: { purchase: populatedPurchase },
      message: 'Purchase added successfully'
    });
  } catch (error) {
    console.error('Create purchase error:', error);
    next(error);
  }
};

const getPurchasesByInventoryItem = async (req, res, next) => {
  try {
    const { inventoryId } = req.params;
    const {
      page = 1,
      limit = 20,
      sortBy = 'purchaseDate',
      sortOrder = 'desc',
      includeConsumed = 'true',
      source = 'all' 
    } = req.query;

    const inventoryItem = await Inventory.findOne({ _id: inventoryId, isDeleted: false });

    if (!inventoryItem) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'INVENTORY_NOT_FOUND'
        }
      });
    }

    const query = {
      inventoryItem: inventoryId,
      isDeleted: false
    };

    if (includeConsumed === 'false') {
      query.remainingQuantity = { $gt: 0 };
    }

    
    if (source !== 'all') {
      query['syncMetadata.source'] = source;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Purchase.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const purchases = await Purchase.find(query)
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalQuantityPurchased = await Purchase.aggregate([
      { $match: { inventoryItem: inventoryItem._id, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$quantity' } } }
    ]);

    const totalRemainingQuantity = await Purchase.aggregate([
      { $match: { inventoryItem: inventoryItem._id, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$remainingQuantity' } } }
    ]);

    
    const sourceBreakdown = await Purchase.aggregate([
      { $match: { inventoryItem: inventoryItem._id, isDeleted: false } },
      {
        $group: {
          _id: '$syncMetadata.source',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: '$totalCost' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        purchases,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        },
        summary: {
          totalPurchases: total,
          totalQuantityPurchased: totalQuantityPurchased[0]?.total || 0,
          totalRemainingQuantity: totalRemainingQuantity[0]?.total || 0,
          sourceBreakdown: sourceBreakdown.reduce((acc, item) => {
            acc[item._id || 'unknown'] = {
              count: item.count,
              totalQuantity: item.totalQuantity,
              totalCost: item.totalCost
            };
            return acc;
          }, {}),
          inventoryItem: {
            id: inventoryItem._id,
            name: inventoryItem.itemName,
            skuCode: inventoryItem.skuCode,
            currentStock: inventoryItem.quantity.current
          }
        }
      }
    });
  } catch (error) {
    console.error('Get purchases error:', error);
    next(error);
  }
};

const getPurchase = async (req, res, next) => {
  try {
    const { purchaseId } = req.params;

    const purchase = await Purchase.findOne({ _id: purchaseId, isDeleted: false })
      .populate('inventoryItem', 'itemName skuCode category quantity pricing')
      .populate('createdBy', 'username fullName email')
      .populate('lastUpdatedBy', 'username fullName email');

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Purchase not found',
          code: 'PURCHASE_NOT_FOUND'
        }
      });
    }

    
    const stockMovements = await StockMovement.find({
      refType: { $in: ['MANUAL', 'PURCHASE_ORDER'] },
      refId: purchase._id
    }).sort({ timestamp: -1 });

    
    let purchaseOrderInfo = null;
    if (purchase.syncMetadata?.source === 'customerconnect' && purchase.syncMetadata?.purchaseOrderId) {
      const purchaseOrder = await PurchaseOrder.findById(purchase.syncMetadata.purchaseOrderId)
        .select('orderNumber status orderDate vendor lastSyncedAt');

      if (purchaseOrder) {
        purchaseOrderInfo = {
          id: purchaseOrder._id,
          orderNumber: purchaseOrder.orderNumber,
          status: purchaseOrder.status,
          orderDate: purchaseOrder.orderDate,
          vendor: purchaseOrder.vendor,
          lastSyncedAt: purchaseOrder.lastSyncedAt
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        purchase,
        stockMovements,
        purchaseOrderInfo,
        syncInfo: {
          source: purchase.syncMetadata?.source || 'manual',
          isSynced: purchase.syncMetadata?.isSynced || false,
          syncedAt: purchase.syncMetadata?.syncedAt,
          syncedBy: purchase.syncMetadata?.syncedBy
        }
      }
    });
  } catch (error) {
    console.error('Get purchase error:', error);
    next(error);
  }
};

const updatePurchase = async (req, res, next) => {
  try {
    const { purchaseId } = req.params;
    const {
      purchaseDate,
      quantity,
      purchasePrice,
      supplier,
      batchNumber,
      expiryDate,
      notes,
      invoiceNumber
    } = req.body;

    let purchase = await Purchase.findOne({ _id: purchaseId, isDeleted: false });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Purchase not found',
          code: 'PURCHASE_NOT_FOUND'
        }
      });
    }

    
    if (purchase.syncMetadata?.source === 'customerconnect' && purchase.syncMetadata?.isSynced) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot update purchases synced from CustomerConnect. Update the source system instead.',
          code: 'SYNCED_PURCHASE_READONLY'
        }
      });
    }

    const inventoryItem = await Inventory.findById(purchase.inventoryItem);

    if (!inventoryItem) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Associated inventory item not found',
          code: 'INVENTORY_NOT_FOUND'
        }
      });
    }

    const oldQuantity = purchase.quantity;
    const oldRemainingQuantity = purchase.remainingQuantity;

    if (purchaseDate !== undefined) purchase.purchaseDate = purchaseDate;
    if (quantity !== undefined) {
      const consumedQuantity = oldQuantity - oldRemainingQuantity;
      purchase.quantity = quantity;
      purchase.remainingQuantity = Math.max(0, quantity - consumedQuantity);
    }
    if (purchasePrice !== undefined) purchase.purchasePrice = purchasePrice;
    if (supplier !== undefined) purchase.supplier = supplier;
    if (batchNumber !== undefined) purchase.batchNumber = batchNumber;
    if (expiryDate !== undefined) purchase.expiryDate = expiryDate;
    if (notes !== undefined) purchase.notes = notes;
    if (invoiceNumber !== undefined) purchase.invoiceNumber = invoiceNumber;

    purchase.lastUpdatedBy = req.user.id;

    await purchase.save();

    if (quantity !== undefined && quantity !== oldQuantity) {
      const quantityDiff = quantity - oldQuantity;
      const previousInventoryQuantity = inventoryItem.quantity.current;
      const newInventoryQuantity = previousInventoryQuantity + quantityDiff;

      inventoryItem.quantity.current = newInventoryQuantity;
      inventoryItem.stockHistory.push({
        action: 'adjusted',
        quantity: Math.abs(quantityDiff),
        previousQuantity: previousInventoryQuantity,
        newQuantity: newInventoryQuantity,
        reason: `Purchase ${purchaseId} updated - quantity changed from ${oldQuantity} to ${quantity}`,
        updatedBy: req.user.id
      });
      inventoryItem.lastUpdatedBy = req.user.id;

      await inventoryItem.save();

      
      await StockMovement.create({
        sku: inventoryItem.skuCode,
        type: 'ADJUST',
        qty: quantityDiff,
        refType: 'ADJUSTMENT',
        refId: purchase._id,
        sourceRef: invoiceNumber || batchNumber,
        timestamp: Date.now(),
        notes: `Purchase quantity adjusted from ${oldQuantity} to ${quantity}`,
        createdBy: req.user.id
      });
    }

    await AuditLog.create({
      action: 'UPDATE',
      resource: 'PURCHASE',
      resourceId: purchase._id,
      performedBy: req.user.id,
      details: {
        inventoryItem: inventoryItem.itemName,
        updates: Object.keys(req.body)
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    const populatedPurchase = await Purchase.findById(purchase._id)
      .populate('inventoryItem', 'itemName skuCode category')
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName');

    res.status(200).json({
      success: true,
      data: { purchase: populatedPurchase },
      message: 'Purchase updated successfully'
    });
  } catch (error) {
    console.error('Update purchase error:', error);
    next(error);
  }
};

const deletePurchase = async (req, res, next) => {
  try {
    const { purchaseId } = req.params;

    const purchase = await Purchase.findOne({ _id: purchaseId, isDeleted: false });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Purchase not found',
          code: 'PURCHASE_NOT_FOUND'
        }
      });
    }

    
    if (purchase.syncMetadata?.source === 'customerconnect' && purchase.syncMetadata?.isSynced) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot delete purchases synced from CustomerConnect. Update the source system instead.',
          code: 'SYNCED_PURCHASE_READONLY'
        }
      });
    }

    if (purchase.remainingQuantity < purchase.quantity) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot delete purchase that has been partially consumed. Remaining quantity must equal original quantity.',
          code: 'PURCHASE_PARTIALLY_CONSUMED'
        }
      });
    }

    
    if (purchase.deletionStatus === 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Deletion request is already pending approval',
          code: 'DELETION_ALREADY_PENDING'
        }
      });
    }

    const inventoryItem = await Inventory.findById(purchase.inventoryItem);

    
    purchase.deletionStatus = 'pending';
    purchase.deletionRequestedBy = req.user.id;
    purchase.deletionRequestedAt = Date.now();
    purchase.lastUpdatedBy = req.user.id;
    await purchase.save();

    await AuditLog.create({
      action: 'DELETE_REQUEST',
      resource: 'PURCHASE',
      resourceId: purchase._id,
      performedBy: req.user.id,
      details: {
        inventoryItem: inventoryItem?.itemName || 'Unknown',
        quantity: purchase.quantity,
        batchNumber: purchase.batchNumber,
        status: 'pending'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Purchase deletion request submitted for approval'
    });
  } catch (error) {
    console.error('Delete purchase error:', error);
    next(error);
  }
};

/**
 * Get unprocessed purchase orders from CustomerConnect sync
 * Shows purchase orders that haven't been converted to inventory purchases yet
 */
const getUnprocessedPurchaseOrders = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'orderDate',
      sortOrder = 'desc',
      status = 'all'
    } = req.query;

    const query = {
      stockProcessed: false
    };

    
    if (status !== 'all') {
      query.status = status;
    } else {
      
      query.status = { $in: ['confirmed', 'received', 'completed'] };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await PurchaseOrder.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const purchaseOrders = await PurchaseOrder.find(query)
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    
    const statusBreakdown = await PurchaseOrder.aggregate([
      { $match: { stockProcessed: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' }
        }
      }
    ]);

    
    let totalItemsPending = 0;
    purchaseOrders.forEach(order => {
      totalItemsPending += order.items.reduce((sum, item) => sum + item.qty, 0);
    });

    res.status(200).json({
      success: true,
      data: {
        purchaseOrders,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        },
        summary: {
          totalUnprocessed: total,
          totalItemsPending,
          statusBreakdown: statusBreakdown.reduce((acc, item) => {
            acc[item._id] = {
              count: item.count,
              totalAmount: item.totalAmount
            };
            return acc;
          }, {})
        }
      },
      message: 'Unprocessed purchase orders retrieved successfully'
    });
  } catch (error) {
    console.error('Get unprocessed purchase orders error:', error);
    next(error);
  }
};

/**
 * Get purchase analytics with sync source breakdown
 */
const getPurchaseAnalytics = async (req, res, next) => {
  try {
    const {
      startDate,
      endDate,
      inventoryId
    } = req.query;

    const query = { isDeleted: false };

    
    if (startDate || endDate) {
      query.purchaseDate = {};
      if (startDate) query.purchaseDate.$gte = new Date(startDate);
      if (endDate) query.purchaseDate.$lte = new Date(endDate);
    }

    
    if (inventoryId) {
      query.inventoryItem = inventoryId;
    }

    
    const sourceAnalytics = await Purchase.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$syncMetadata.source',
          totalPurchases: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: '$totalCost' },
          avgPurchasePrice: { $avg: '$purchasePrice' },
          totalRemaining: { $sum: '$remainingQuantity' }
        }
      }
    ]);

    
    const monthlyTrend = await Purchase.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            year: { $year: '$purchaseDate' },
            month: { $month: '$purchaseDate' },
            source: '$syncMetadata.source'
          },
          totalPurchases: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: '$totalCost' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    
    const topSuppliers = await Purchase.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$supplier.name',
          totalPurchases: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: '$totalCost' }
        }
      },
      { $sort: { totalCost: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        sourceAnalytics,
        monthlyTrend,
        topSuppliers
      }
    });
  } catch (error) {
    console.error('Get purchase analytics error:', error);
    next(error);
  }
};

module.exports = {
  createPurchase,
  getPurchasesByInventoryItem,
  getPurchase,
  updatePurchase,
  deletePurchase,
  getUnprocessedPurchaseOrders,
  getPurchaseAnalytics
};
