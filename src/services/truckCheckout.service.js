const TruckCheckout = require('../models/TruckCheckout');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const stockCalculationService = require('./stockCalculation.service');

/**
 * Truck Checkout Service
 * Handles all business logic for truck checkouts
 */
class TruckCheckoutService {
  /**
   * Create a new checkout with stock validation
   * @param {Object} checkoutData - Checkout data
   * @param {string} userId - User ID creating the checkout
   * @returns {Promise<Object>} Result with checkout and stock update info
   */
  async createCheckout(checkoutData, userId) {
    const {
      employeeName,
      employeeId,
      truckNumber,
      itemName,
      quantityTaking,
      remainingQuantity,
      notes,
      checkoutDate,
      acceptDiscrepancy = false
    } = checkoutData;

    console.log(`\n📦 Creating checkout for ${employeeName}`);
    console.log(`   Item: ${itemName}, Taking: ${quantityTaking}, Remaining: ${remainingQuantity}`);

    // Step 1: Validate stock
    const validation = await stockCalculationService.validateCheckoutStock(
      itemName,
      quantityTaking,
      remainingQuantity
    );

    console.log(`   Current stock: ${validation.currentStock}`);
    console.log(`   Expected remaining: ${validation.systemCalculatedRemaining}`);

    // Step 2: Check for discrepancy
    if (validation.hasDiscrepancy && !acceptDiscrepancy) {
      return {
        success: false,
        requiresConfirmation: true,
        message: 'Stock discrepancy detected. Please confirm to proceed.',
        validation
      };
    }

    // Step 3: Create checkout record
    const checkout = await TruckCheckout.create({
      employeeName,
      employeeId,
      truckNumber,
      itemName,
      quantityTaking,
      remainingQuantity,
      systemCalculatedRemaining: validation.systemCalculatedRemaining,
      hasDiscrepancy: validation.hasDiscrepancy,
      discrepancyAccepted: validation.hasDiscrepancy && acceptDiscrepancy,
      notes,
      checkoutDate: checkoutDate || new Date(),
      createdBy: userId,
      status: 'checked_out',
      itemsTaken: []
    });

    console.log(`   ✓ Checkout created: ${checkout._id}`);

    // Step 4: Handle discrepancy if accepted
    let discrepancy = null;
    if (validation.hasDiscrepancy && acceptDiscrepancy) {
      discrepancy = await this._createDiscrepancy(checkout, validation, userId);
      checkout.discrepancyId = discrepancy._id;
      await checkout.save();
    }

    // Step 5: Update stock
    const stockUpdate = await this._updateStock(
      itemName,
      quantityTaking,
      validation,
      checkout
    );

    console.log(`   ✓ Stock updated: ${stockUpdate.sku} = ${stockUpdate.newStock}\n`);

    return {
      success: true,
      message: validation.hasDiscrepancy
        ? 'Checkout created with discrepancy adjustment'
        : 'Checkout created successfully',
      checkout,
      discrepancy,
      stockUpdate
    };
  }

  /**
   * Create discrepancy record for checkout
   * @private
   */
  async _createDiscrepancy(checkout, validation, userId) {
    const discrepancy = await StockDiscrepancy.create({
      invoiceNumber: `CHECKOUT-${checkout._id}`,
      invoiceType: 'TruckCheckout',
      itemName: checkout.itemName,
      categoryName: validation.stockInfo.canonicalName || checkout.itemName,
      systemQuantity: validation.systemCalculatedRemaining,
      actualQuantity: validation.userRemainingQuantity,
      discrepancyType: validation.discrepancyType,
      reason: 'Truck checkout stock validation',
      notes: `Checkout by ${checkout.employeeName} - Truck ${checkout.truckNumber || 'N/A'}. System expected ${validation.systemCalculatedRemaining}, user entered ${validation.userRemainingQuantity}.`,
      reportedBy: userId,
      status: 'Approved'
    });

    console.log(`   ✓ Discrepancy created and auto-approved: ${discrepancy._id}`);
    return discrepancy;
  }

  /**
   * Update stock for checkout
   * @private
   */
  async _updateStock(itemName, quantityTaking, validation, checkout) {
    const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
    const sku = (canonicalName || itemName).toUpperCase();

    // Create stock movement
    await StockMovement.create({
      sku,
      type: 'OUT',
      qty: quantityTaking,
      refType: 'TRUCK_CHECKOUT',
      refId: checkout._id,
      sourceRef: `Checkout to ${checkout.employeeName} - Truck ${checkout.truckNumber || 'N/A'}`,
      timestamp: checkout.checkoutDate,
      notes: `Checked out to truck: ${checkout.employeeName}${checkout.notes ? ` (${checkout.notes})` : ''}`
    });

    // Update StockSummary
    let stockSummary = await StockSummary.findOne({ sku });
    if (!stockSummary) {
      stockSummary = await StockSummary.create({
        sku,
        availableQty: validation.currentStock || 0,
        reservedQty: 0,
        totalInQty: 0,
        totalOutQty: 0,
        lowStockThreshold: 10
      });
    }

    const previousStock = stockSummary.availableQty;

    // Remove quantity taken
    stockSummary.removeStock(quantityTaking);

    // Apply discrepancy adjustment if needed
    let discrepancyAdjustment = 0;
    if (validation.hasDiscrepancy) {
      const diff = validation.discrepancyDifference;
      if (diff > 0) {
        stockSummary.addStock(diff);
        discrepancyAdjustment = diff;
        console.log(`   ✓ Discrepancy adjustment: +${diff}`);
      } else {
        stockSummary.removeStock(Math.abs(diff));
        discrepancyAdjustment = diff;
        console.log(`   ✓ Discrepancy adjustment: ${diff}`);
      }
    }

    await stockSummary.save();

    return {
      sku,
      previousStock,
      quantityTaken: quantityTaking,
      discrepancyAdjustment,
      newStock: stockSummary.availableQty
    };
  }

  /**
   * Get checkouts with filtering and pagination
   */
  async getCheckouts(filters = {}, pagination = {}) {
    const {
      status,
      employeeName,
      startDate,
      endDate
    } = filters;

    const {
      page = 1,
      limit = 50
    } = pagination;

    const query = {};

    if (status) query.status = status;
    if (employeeName) query.employeeName = new RegExp(employeeName, 'i');
    if (startDate || endDate) {
      query.checkoutDate = {};
      if (startDate) query.checkoutDate.$gte = new Date(startDate);
      if (endDate) query.checkoutDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [checkouts, total] = await Promise.all([
      TruckCheckout.find(query)
        .sort({ checkoutDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('discrepancyId')
        .lean(),
      TruckCheckout.countDocuments(query)
    ]);

    return {
      checkouts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get checkout by ID
   */
  async getCheckoutById(checkoutId) {
    const checkout = await TruckCheckout.findById(checkoutId)
      .populate('discrepancyId')
      .lean();

    if (!checkout) {
      throw new Error('Checkout not found');
    }

    return checkout;
  }

  /**
   * Delete checkout and reverse stock movements
   */
  async deleteCheckout(checkoutId) {
    const checkout = await TruckCheckout.findById(checkoutId);

    if (!checkout) {
      throw new Error('Checkout not found');
    }

    if (checkout.stockProcessed) {
      throw new Error('Cannot delete checkout with processed stock movements');
    }

    console.log(`\n🗑️  Deleting checkout ${checkoutId}...`);

    // Reverse stock movements for new structure
    if (checkout.quantityTaking && checkout.itemName) {
      await this._reverseStockForItem(checkout.itemName, checkout.quantityTaking, checkout._id);
    }

    // Reverse stock movements for old structure (backwards compatibility)
    if (checkout.itemsTaken?.length > 0) {
      for (const item of checkout.itemsTaken) {
        await this._reverseStockForItem(item.name, item.quantity, checkout._id);
      }
    }

    // Delete related stock movements
    await StockMovement.deleteMany({
      refType: { $in: ['TRUCK_CHECKOUT', 'TRUCK_CHECKOUT_ADJUSTMENT', 'TRUCK_CHECKOUT_USED'] },
      refId: checkout._id
    });

    // Delete discrepancy if exists
    if (checkout.discrepancyId) {
      await StockDiscrepancy.findByIdAndDelete(checkout.discrepancyId);
    }

    await checkout.deleteOne();

    console.log(`✓ Checkout ${checkoutId} deleted and stock reversed\n`);

    return { success: true, message: 'Checkout deleted and stock movements reversed' };
  }

  /**
   * Reverse stock for a single item
   * @private
   */
  async _reverseStockForItem(itemName, quantity, checkoutId) {
    if (quantity <= 0) return;

    try {
      const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
      const sku = (canonicalName || itemName).toUpperCase();

      const stockSummary = await StockSummary.findOne({ sku });
      if (stockSummary) {
        stockSummary.addStock(quantity);
        await stockSummary.save();
        console.log(`   ✓ Reversed ${sku}: +${quantity}`);
      }
    } catch (error) {
      console.error(`   ✗ Failed to reverse stock for ${itemName}: ${error.message}`);
    }
  }
}

module.exports = new TruckCheckoutService();
