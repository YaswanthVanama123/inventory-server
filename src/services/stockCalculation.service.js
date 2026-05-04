const StockSummary = require('../models/StockSummary');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const TruckCheckout = require('../models/TruckCheckout');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const ModelCategory = require('../models/ModelCategory');


class StockCalculationService {
  async getCurrentStock(itemName) {
    try {
      const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
      const sku = (canonicalName || itemName).toUpperCase();

      // Use stock.service.js calculation which has all the sophisticated matching logic
      const stockService = require('./stock.service');
      const stockSummary = await stockService.getStockSummary();

      // Find the item in the sell stock data
      const itemData = stockSummary.sellStock.items.find(
        item => item.categoryName === canonicalName || item.categoryName === itemName
      );

      if (itemData) {
        console.log(`[stockCalculation getCurrentStock] Using stock.service data for ${canonicalName}:`, itemData);
        return {
          sku,
          canonicalName: itemData.categoryName,
          availableQty: itemData.stockRemaining,
          totalPurchased: itemData.totalPurchased,
          totalSold: itemData.totalSold,
          totalCheckedOut: itemData.totalCheckedOut,
          totalDiscrepancyAdjustment: itemData.totalDiscrepancyDifference,
          source: 'StockService'
        };
      }

      // Fallback to direct calculation if not found in stock summary
      console.log(`[stockCalculation getCurrentStock] Item ${canonicalName} not found in stock.service, using direct calculation`);
      return await this._calculateStockFromSources(canonicalName, sku);
    } catch (error) {
      console.error('Error calculating current stock:', error);
      throw error;
    }
  }
  async _calculateStockFromSources(canonicalName, sku) {
    // Get cutoff date from settings
    const Settings = require('../models/Settings');
    const settings = await Settings.getSettings();
    const cutoffDate = settings.stockCalculationCutoffDate;

    const totalPurchased = await this._calculatePurchases(canonicalName);
    const totalSoldBeforeCutoff = await this._calculateSales(canonicalName, cutoffDate);
    const totalCheckedOut = await this._calculateCheckouts(canonicalName, null); // Get ALL checkouts
    const totalDiscrepancyAdjustment = await this._calculateDiscrepancyAdjustments(canonicalName);

    // Match stock.service.js formula: totalPurchased - totalSoldBeforeCutoff - totalCheckedOut + discrepancyAdjustment
    const availableQty = totalPurchased - totalSoldBeforeCutoff - totalCheckedOut + totalDiscrepancyAdjustment;

    console.log(`[stockCalculation] ${canonicalName}: purchased=${totalPurchased}, sold=${totalSoldBeforeCutoff}, checkedOut=${totalCheckedOut}, discrepancy=${totalDiscrepancyAdjustment}, TOTAL=${availableQty}`);

    return {
      sku,
      canonicalName,
      availableQty,
      totalPurchased,
      totalSold: totalSoldBeforeCutoff, // For backward compatibility, keep same field name
      totalCheckedOut: totalCheckedOut, // ALL checkouts
      totalDiscrepancyAdjustment,
      source: 'Calculated'
    };
  }
  async _calculatePurchases(canonicalName) {
    const mappings = await ModelCategory.find({ categoryItemName: canonicalName }).lean();
    const skus = mappings.map(m => m.modelNumber);
    if (skus.length === 0) return 0;

    // Query both CustomerConnect orders AND Manual purchase orders
    const PurchaseOrder = require('../models/PurchaseOrder');

    const [ccOrders, manualOrders] = await Promise.all([
      // CustomerConnect orders
      CustomerConnectOrder.find({
        status: { $in: ['Complete', 'Processing', 'Shipped'] },
        verified: true,  // Only count verified orders
        'items.sku': { $in: skus }
      }).lean(),
      // Manual purchase orders
      PurchaseOrder.find({
        source: 'manual',
        status: { $in: ['confirmed', 'received', 'completed'] },
        verified: true,
        'items.sku': { $in: skus }
      }).lean()
    ]);

    let total = 0;

    // Count CustomerConnect orders
    ccOrders.forEach(order => {
      order.items?.forEach(item => {
        if (skus.includes(item.sku?.toUpperCase())) {
          total += item.qty || 0;
        }
      });
    });

    // Count Manual purchase orders
    manualOrders.forEach(order => {
      order.items?.forEach(item => {
        if (skus.includes(item.sku?.toUpperCase())) {
          total += item.qty || 0;
        }
      });
    });

    return total;
  }
  async _calculateSales(canonicalName, cutoffDate) {
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    const variations = await this._getItemVariations(canonicalName, aliasMap);
    const query = {
      status: { $in: ['Completed', 'Closed', 'Pending'] },
      'lineItems.name': { $in: variations }
    };

    // If cutoff date exists, only count invoices before the cutoff
    if (cutoffDate) {
      query.invoiceDate = { $lt: cutoffDate };
    }

    console.log(`[_calculateSales] ${canonicalName} - searching with variations:`, variations);

    const invoices = await RouteStarInvoice.find(query).lean();
    console.log(`[_calculateSales] ${canonicalName} - found ${invoices.length} invoices`);

    let total = 0;
    invoices.forEach(invoice => {
      invoice.lineItems?.forEach(item => {
        const itemCanonical = aliasMap[item.name?.toLowerCase()] || item.name;
        if (itemCanonical === canonicalName) {
          console.log(`[_calculateSales] ${canonicalName} - matched line item: ${item.name} (qty: ${item.quantity})`);
          total += item.quantity || 0;
        }
      });
    });
    console.log(`[_calculateSales] ${canonicalName} - total sales: ${total}`);
    return total;
  }
  async _calculateCheckouts(canonicalName, cutoffDate) {
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    const variations = await this._getItemVariations(canonicalName, aliasMap);
    const query = {
      status: 'checked_out',
      $or: [
        { itemName: { $in: variations } },
        { 'itemsTaken.name': { $in: variations } }
      ]
    };

    // If cutoff date exists, only count checkouts after the cutoff
    // If cutoffDate is null, get ALL checkouts
    if (cutoffDate) {
      query.checkoutDate = { $gte: cutoffDate };
    }

    const checkouts = await TruckCheckout.find(query).lean();
    let total = 0;
    checkouts.forEach(checkout => {
      if (checkout.quantityTaking && variations.includes(checkout.itemName)) {
        total += checkout.quantityTaking;
      }
      if (checkout.itemsTaken?.length > 0) {
        checkout.itemsTaken.forEach(item => {
          const itemCanonical = aliasMap[item.name?.toLowerCase()] || item.name;
          if (itemCanonical === canonicalName) {
            total += item.quantity || 0;
          }
        });
      }
    });
    return total;
  }
  async _calculateDiscrepancyAdjustments(canonicalName) {
    const discrepancies = await StockDiscrepancy.find({
      categoryName: canonicalName,
      status: 'Approved'
    }).lean();
    let total = 0;
    discrepancies.forEach(d => {
      total += d.difference || 0;
    });
    return total;
  }
  async _getItemVariations(canonicalName, aliasMap = null) {
    if (!aliasMap) {
      aliasMap = await RouteStarItemAlias.buildLookupMap();
    }
    const variations = [canonicalName, canonicalName.toLowerCase()];
    Object.keys(aliasMap).forEach(alias => {
      if (aliasMap[alias] === canonicalName) {
        variations.push(alias);
      }
    });
    return variations;
  }
  async validateCheckoutStock(itemName, quantityTaking, userRemainingQuantity) {
    const currentStock = await this.getCurrentStock(itemName);
    const systemCalculatedRemaining = currentStock.availableQty - quantityTaking;

    // Use tolerance for floating-point comparison (allow 0.01 difference for rounding)
    const tolerance = 0.01;
    const difference = Math.abs(userRemainingQuantity - systemCalculatedRemaining);
    const hasDiscrepancy = difference > tolerance;
    const discrepancyDifference = userRemainingQuantity - systemCalculatedRemaining;

    return {
      isValid: !hasDiscrepancy,
      hasDiscrepancy,
      currentStock: currentStock.availableQty,
      systemCalculatedRemaining,
      userRemainingQuantity,
      discrepancyDifference,
      discrepancyType: discrepancyDifference > 0 ? 'Overage' : 'Shortage',
      stockInfo: currentStock
    };
  }
  async getBatchStock(itemNames) {
    const results = {};
    await Promise.all(
      itemNames.map(async (itemName) => {
        try {
          results[itemName] = await this.getCurrentStock(itemName);
        } catch (error) {
          results[itemName] = {
            error: error.message,
            availableQty: 0
          };
        }
      })
    );
    return results;
  }
  async searchItemsWithStock(options = {}) {
    const { q = '', forSell = true, limit = 100 } = options;
    const RouteStarItem = require('../models/RouteStarItem');
    const query = {};
    if (forSell) query.forSell = true;
    if (q) query.itemName = new RegExp(q, 'i');
    const items = await RouteStarItem.find(query)
      .select('itemName itemParent qtyOnHand')
      .sort({ itemName: 1 })
      .limit(limit)
      .lean();
    const itemNames = items.map(item => item.itemName);
    const stockMap = await this.getBatchStock(itemNames);
    return items.map(item => {
      const stockInfo = stockMap[item.itemName] || {};
      return {
        itemName: item.itemName,
        itemParent: item.itemParent,
        qtyOnHand: item.qtyOnHand,
        currentStock: stockInfo.availableQty || 0,
        totalPurchased: stockInfo.totalPurchased || 0,
        totalSold: stockInfo.totalSold || 0,
        totalCheckedOut: stockInfo.totalCheckedOut || 0,
        totalDiscrepancyAdjustment: stockInfo.totalDiscrepancyAdjustment || 0,
        stockInfo: stockInfo
      };
    });
  }
}
module.exports = new StockCalculationService();
