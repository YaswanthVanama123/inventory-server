const Purchase = require('../models/Purchase');
const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');

/**
 * Get all purchases with deletion status 'pending'
 * @route GET /api/approvals/purchases/pending
 * @access Admin only
 */
const getPendingPurchaseDeletions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'deletionRequestedAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {
      deletionStatus: 'pending',
      isDeleted: false
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Purchase.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const purchases = await Purchase.find(query)
      .populate('inventoryItem', 'itemName skuCode category quantity pricing')
      .populate('deletionRequestedBy', 'username fullName email')
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        purchases,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get pending purchase deletions error:', error);
    next(error);
  }
};

/**
 * Approve purchase deletion
 * Restores inventory quantity and permanently deletes the purchase
 * @route POST /api/approvals/purchases/:purchaseId/approve
 * @access Admin only
 */
const approvePurchaseDeletion = async (req, res, next) => {
  try {
    const { purchaseId } = req.params;
    const { reason } = req.body;

    const purchase = await Purchase.findOne({
      _id: purchaseId,
      deletionStatus: 'pending',
      isDeleted: false
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Purchase not found or deletion not pending',
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

    // Restore inventory quantity by subtracting the purchase quantity
    const previousInventoryQuantity = inventoryItem.quantity.current;
    const newInventoryQuantity = previousInventoryQuantity - purchase.quantity;

    inventoryItem.quantity.current = newInventoryQuantity;
    inventoryItem.stockHistory.push({
      action: 'removed',
      quantity: purchase.quantity,
      previousQuantity: previousInventoryQuantity,
      newQuantity: newInventoryQuantity,
      reason: `Purchase ${purchaseId} deletion approved - Batch: ${purchase.batchNumber || 'N/A'}, Invoice: ${purchase.invoiceNumber || 'N/A'}`,
      updatedBy: req.user.id
    });
    inventoryItem.lastUpdatedBy = req.user.id;

    await inventoryItem.save();

    // Create audit log before permanent deletion
    await AuditLog.create({
      action: 'DELETE_APPROVE',
      resource: 'PURCHASE',
      resourceId: purchase._id,
      performedBy: req.user.id,
      details: {
        inventoryItem: inventoryItem.itemName,
        quantity: purchase.quantity,
        batchNumber: purchase.batchNumber,
        invoiceNumber: purchase.invoiceNumber,
        deletionRequestedBy: purchase.deletionRequestedBy,
        deletionRequestedAt: purchase.deletionRequestedAt,
        reason: reason || 'No reason provided'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Permanently delete the purchase
    await Purchase.findByIdAndDelete(purchaseId);

    res.status(200).json({
      success: true,
      message: 'Purchase deletion approved and inventory restored',
      data: {
        inventoryUpdated: {
          itemName: inventoryItem.itemName,
          previousQuantity: previousInventoryQuantity,
          newQuantity: newInventoryQuantity,
          quantityRestored: purchase.quantity
        }
      }
    });
  } catch (error) {
    console.error('Approve purchase deletion error:', error);
    next(error);
  }
};

/**
 * Reject purchase deletion
 * Sets deletion status to 'rejected' and keeps the purchase
 * @route POST /api/approvals/purchases/:purchaseId/reject
 * @access Admin only
 */
const rejectPurchaseDeletion = async (req, res, next) => {
  try {
    const { purchaseId } = req.params;
    const { reason } = req.body;

    const purchase = await Purchase.findOne({
      _id: purchaseId,
      deletionStatus: 'pending',
      isDeleted: false
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Purchase not found or deletion not pending',
          code: 'PURCHASE_NOT_FOUND'
        }
      });
    }

    const inventoryItem = await Inventory.findById(purchase.inventoryItem);

    // Update purchase status to rejected
    purchase.deletionStatus = 'rejected';
    purchase.deletionRejectedBy = req.user.id;
    purchase.deletionRejectedAt = Date.now();
    purchase.deletionReason = reason || 'No reason provided';
    purchase.lastUpdatedBy = req.user.id;

    await purchase.save();

    // Create audit log
    await AuditLog.create({
      action: 'DELETE_REJECT',
      resource: 'PURCHASE',
      resourceId: purchase._id,
      performedBy: req.user.id,
      details: {
        inventoryItem: inventoryItem?.itemName || 'Unknown',
        quantity: purchase.quantity,
        batchNumber: purchase.batchNumber,
        invoiceNumber: purchase.invoiceNumber,
        deletionRequestedBy: purchase.deletionRequestedBy,
        deletionRequestedAt: purchase.deletionRequestedAt,
        reason: reason || 'No reason provided'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    const populatedPurchase = await Purchase.findById(purchase._id)
      .populate('inventoryItem', 'itemName skuCode category')
      .populate('deletionRequestedBy', 'username fullName')
      .populate('deletionRejectedBy', 'username fullName')
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName');

    res.status(200).json({
      success: true,
      message: 'Purchase deletion rejected',
      data: { purchase: populatedPurchase }
    });
  } catch (error) {
    console.error('Reject purchase deletion error:', error);
    next(error);
  }
};

module.exports = {
  getPendingPurchaseDeletions,
  approvePurchaseDeletion,
  rejectPurchaseDeletion
};
