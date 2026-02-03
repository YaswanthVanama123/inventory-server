const Purchase = require('../models/Purchase');
const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');

const createPurchase = async (req, res, next) => {
  try {
    const { inventoryId } = req.params;
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

    const purchase = await Purchase.create({
      inventoryItem: inventoryId,
      purchaseDate: purchaseDate || Date.now(),
      quantity,
      unit: inventoryItem.quantity.unit,
      purchasePrice,
      totalCost,
      supplier,
      batchNumber,
      expiryDate,
      notes,
      invoiceNumber,
      remainingQuantity: quantity,
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
        batchNumber
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
      includeConsumed = 'true'
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

    res.status(200).json({
      success: true,
      data: { purchase }
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

    if (purchase.remainingQuantity < purchase.quantity) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot delete purchase that has been partially consumed. Remaining quantity must equal original quantity.',
          code: 'PURCHASE_PARTIALLY_CONSUMED'
        }
      });
    }

    // Check if deletion request is already pending
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

    // Soft delete: Set deletion status to pending without reducing inventory
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

module.exports = {
  createPurchase,
  getPurchasesByInventoryItem,
  getPurchase,
  updatePurchase,
  deletePurchase
};
