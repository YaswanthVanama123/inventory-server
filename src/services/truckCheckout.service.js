const TruckCheckout = require('../models/TruckCheckout');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const stockCalculationService = require('./stockCalculation.service');


class TruckCheckoutService {
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
    const validation = await stockCalculationService.validateCheckoutStock(
      itemName,
      quantityTaking,
      remainingQuantity
    );
    console.log(`   Current stock: ${validation.currentStock}`);
    console.log(`   Expected remaining: ${validation.systemCalculatedRemaining}`);
    if (validation.hasDiscrepancy && !acceptDiscrepancy) {
      return {
        success: false,
        requiresConfirmation: true,
        message: 'Stock discrepancy detected. Please confirm to proceed.',
        validation
      };
    }
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
    let discrepancy = null;
    if (validation.hasDiscrepancy && acceptDiscrepancy) {
      discrepancy = await this._createDiscrepancy(checkout, validation, userId);
      checkout.discrepancyId = discrepancy._id;
      await checkout.save();
    }
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
  async _updateStock(itemName, quantityTaking, validation, checkout) {
    const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
    const sku = (canonicalName || itemName).toUpperCase();
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
    stockSummary.removeStock(quantityTaking);
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
  async getCheckoutById(checkoutId) {
    const checkout = await TruckCheckout.findById(checkoutId)
      .populate('discrepancyId')
      .lean();
    if (!checkout) {
      throw new Error('Checkout not found');
    }
    return checkout;
  }
  async deleteCheckout(checkoutId) {
    const checkout = await TruckCheckout.findById(checkoutId);
    if (!checkout) {
      throw new Error('Checkout not found');
    }
    if (checkout.stockProcessed) {
      throw new Error('Cannot delete checkout with processed stock movements');
    }
    console.log(`\n🗑️  Deleting checkout ${checkoutId}...`);
    if (checkout.quantityTaking && checkout.itemName) {
      await this._reverseStockForItem(checkout.itemName, checkout.quantityTaking, checkout._id);
    }
    if (checkout.itemsTaken?.length > 0) {
      for (const item of checkout.itemsTaken) {
        await this._reverseStockForItem(item.name, item.quantity, checkout._id);
      }
    }
    await StockMovement.deleteMany({
      refType: { $in: ['TRUCK_CHECKOUT', 'TRUCK_CHECKOUT_ADJUSTMENT', 'TRUCK_CHECKOUT_USED'] },
      refId: checkout._id
    });
    if (checkout.discrepancyId) {
      await StockDiscrepancy.findByIdAndDelete(checkout.discrepancyId);
    }
    await checkout.deleteOne();
    console.log(`✓ Checkout ${checkoutId} deleted and stock reversed\n`);
    return { success: true, message: 'Checkout deleted and stock movements reversed' };
  }
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
  async getCheckoutSalesTracking(filters = {}) {
    const RouteStarInvoice = require('../models/RouteStarInvoice');
    console.log('\n📊 Getting checkout sales tracking...');
    try {
      const query = { status: { $ne: 'cancelled' } };
      if (filters.employeeName) {
        query.employeeName = new RegExp(filters.employeeName, 'i');
      }
      if (filters.truckNumber) {
        query.truckNumber = new RegExp(filters.truckNumber, 'i');
      }
      if (filters.startDate) {
        query.checkoutDate = { $gte: new Date(filters.startDate) };
      }
      if (filters.endDate) {
        query.checkoutDate = {
          ...query.checkoutDate,
          $lte: new Date(filters.endDate)
        };
      }
      const checkouts = await TruckCheckout.find(query)
        .sort({ checkoutDate: -1 })
        .lean();
      console.log(`✓ Found ${checkouts.length} checkouts to track`);
      const trackingData = [];
      for (const checkout of checkouts) {
        if (!checkout.itemName) {
          continue;
        }
        const checkoutDate = new Date(checkout.checkoutDate);
        const itemName = checkout.itemName;
        const truckNumber = checkout.truckNumber;
        const quantityCheckedOut = checkout.quantityTaking || 0;
        const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
        const invoiceQuery = {
          invoiceDate: { $gte: checkoutDate },
          'lineItems': { $exists: true, $ne: [] }
        };
        if (truckNumber) {
          invoiceQuery.$or = [
            { truckNumber: new RegExp(truckNumber, 'i') },
            { 'customer.name': new RegExp(truckNumber, 'i') }
          ];
        }
        const matchedInvoices = await RouteStarInvoice.find(invoiceQuery).lean();
        let totalSold = 0;
        const invoiceDetails = [];
        for (const invoice of matchedInvoices) {
          for (const lineItem of invoice.lineItems || []) {
            const lineItemCanonical = await RouteStarItemAlias.getCanonicalName(lineItem.name);
            if (
              lineItemCanonical === canonicalName ||
              lineItem.name.toLowerCase() === itemName.toLowerCase() ||
              lineItemCanonical === itemName
            ) {
              totalSold += lineItem.quantity || 0;
              invoiceDetails.push({
                invoiceNumber: invoice.invoiceNumber,
                invoiceDate: invoice.invoiceDate,
                quantity: lineItem.quantity,
                itemName: lineItem.name
              });
            }
          }
        }
        const remaining = quantityCheckedOut - totalSold;
        let status = 'Good';
        if (remaining > 0) {
          status = 'Shortage';
        } else if (remaining < 0) {
          status = 'Overage';
        }
        trackingData.push({
          checkoutId: checkout._id,
          employeeName: checkout.employeeName,
          truckNumber: checkout.truckNumber,
          checkoutDate: checkout.checkoutDate,
          itemName: checkout.itemName,
          quantityCheckedOut,
          totalSold,
          remaining: Math.abs(remaining),
          status,
          matchedInvoices: invoiceDetails.length,
          invoiceDetails: invoiceDetails.slice(0, 5)
        });
      }
      console.log(`✓ Tracked ${trackingData.length} checkouts with sales data\n`);
      return {
        checkouts: trackingData,
        total: trackingData.length,
        summary: {
          good: trackingData.filter(c => c.status === 'Good').length,
          shortage: trackingData.filter(c => c.status === 'Shortage').length,
          overage: trackingData.filter(c => c.status === 'Overage').length
        }
      };
    } catch (error) {
      console.error('Get checkout sales tracking error:', error);
      throw error;
    }
  }
  async getAllEmployeesWithStats(filters = {}) {
    try {
      console.log('\n👥 Getting all employees with stats...');
      const matchStage = {};
      if (filters.startDate || filters.endDate) {
        matchStage.checkoutDate = {};
        if (filters.startDate) matchStage.checkoutDate.$gte = new Date(filters.startDate);
        if (filters.endDate) matchStage.checkoutDate.$lte = new Date(filters.endDate);
      }
      const employees = await TruckCheckout.aggregate([
        ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
        {
          $group: {
            _id: {
              employeeName: '$employeeName',
              truckNumber: { $ifNull: ['$truckNumber', 'N/A'] }
            },
            totalCheckouts: { $sum: 1 },
            activeCheckouts: {
              $sum: { $cond: [{ $eq: ['$status', 'checked_out'] }, 1, 0] }
            },
            completedCheckouts: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            lastCheckoutDate: { $max: '$checkoutDate' }
          }
        },
        {
          $project: {
            _id: 0,
            employeeName: '$_id.employeeName',
            truckNumber: '$_id.truckNumber',
            totalCheckouts: 1,
            activeCheckouts: 1,
            completedCheckouts: 1,
            lastCheckoutDate: 1
          }
        },
        { $sort: { employeeName: 1 } }
      ]);
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return employees.filter(emp =>
          emp.employeeName.toLowerCase().includes(searchLower) ||
          emp.truckNumber.toLowerCase().includes(searchLower)
        );
      }
      console.log(`✓ Found ${employees.length} employees\n`);
      return employees;
    } catch (error) {
      console.error('Get all employees with stats error:', error);
      throw error;
    }
  }
}
module.exports = new TruckCheckoutService();
