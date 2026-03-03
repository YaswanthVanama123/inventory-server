const StockSummary = require('../models/StockSummary');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const TruckCheckout = require('../models/TruckCheckout');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const ModelCategory = require('../models/ModelCategory');

/**
 * Stock Calculation Service
 * Centralized service for all stock-related calculations
 */
class StockCalculationService {
  /**
   * Get current available stock for an item
   * @param {string} itemName - The item name (canonical or alias)
   * @returns {Promise<Object>} Stock information
   */
  async getCurrentStock(itemName) {
    try {
      // Get canonical name
      const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
      const sku = (canonicalName || itemName).toUpperCase();

      // Check StockSummary first (most efficient)
      const stockSummary = await StockSummary.findOne({ sku });

      if (stockSummary) {
        return {
          sku,
          canonicalName,
          availableQty: stockSummary.availableQty,
          totalInQty: stockSummary.totalInQty,
          totalOutQty: stockSummary.totalOutQty,
          source: 'StockSummary'
        };
      }

      // If no StockSummary, calculate from all sources
      return await this._calculateStockFromSources(canonicalName, sku);
    } catch (error) {
      console.error('Error calculating current stock:', error);
      throw error;
    }
  }

  /**
   * Calculate stock from all data sources
   * @private
   */
  async _calculateStockFromSources(canonicalName, sku) {
    // Get purchases
    const totalPurchased = await this._calculatePurchases(canonicalName);

    // Get sales
    const totalSold = await this._calculateSales(canonicalName);

    // Get active checkouts
    const totalCheckedOut = await this._calculateCheckouts(canonicalName);

    // Get discrepancy adjustments
    const totalDiscrepancyAdjustment = await this._calculateDiscrepancyAdjustments(canonicalName);

    const availableQty = totalPurchased - totalSold - totalCheckedOut + totalDiscrepancyAdjustment;

    return {
      sku,
      canonicalName,
      availableQty,
      totalPurchased,
      totalSold,
      totalCheckedOut,
      totalDiscrepancyAdjustment,
      source: 'Calculated'
    };
  }

  /**
   * Calculate total purchases for an item
   * @private
   */
  async _calculatePurchases(canonicalName) {
    const mappings = await ModelCategory.find({ categoryItemName: canonicalName }).lean();
    const skus = mappings.map(m => m.modelNumber);

    if (skus.length === 0) return 0;

    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] },
      'items.sku': { $in: skus }
    }).lean();

    let total = 0;
    orders.forEach(order => {
      order.items?.forEach(item => {
        if (skus.includes(item.sku?.toUpperCase())) {
          total += item.qty || 0;
        }
      });
    });

    return total;
  }

  /**
   * Calculate total sales for an item
   * @private
   */
  async _calculateSales(canonicalName) {
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    const variations = await this._getItemVariations(canonicalName, aliasMap);

    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] },
      'lineItems.name': { $in: variations }
    }).lean();

    let total = 0;
    invoices.forEach(invoice => {
      invoice.lineItems?.forEach(item => {
        const itemCanonical = aliasMap[item.name?.toLowerCase()] || item.name;
        if (itemCanonical === canonicalName) {
          total += item.quantity || 0;
        }
      });
    });

    return total;
  }

  /**
   * Calculate total checked out quantity for an item
   * @private
   */
  async _calculateCheckouts(canonicalName) {
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    const variations = await this._getItemVariations(canonicalName, aliasMap);

    const checkouts = await TruckCheckout.find({
      status: 'checked_out',
      $or: [
        { itemName: { $in: variations } },
        { 'itemsTaken.name': { $in: variations } }
      ]
    }).lean();

    let total = 0;
    checkouts.forEach(checkout => {
      // New structure
      if (checkout.quantityTaking && variations.includes(checkout.itemName)) {
        total += checkout.quantityTaking;
      }

      // Old structure (backwards compatibility)
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

  /**
   * Calculate total discrepancy adjustments for an item
   * @private
   */
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

  /**
   * Get all variations (aliases) of an item name
   * @private
   */
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

  /**
   * Validate stock availability for checkout
   * @param {string} itemName - Item name
   * @param {number} quantityTaking - Quantity to take
   * @param {number} userRemainingQuantity - User-entered remaining
   * @returns {Promise<Object>} Validation result
   */
  async validateCheckoutStock(itemName, quantityTaking, userRemainingQuantity) {
    const currentStock = await this.getCurrentStock(itemName);
    const systemCalculatedRemaining = currentStock.availableQty - quantityTaking;
    const hasDiscrepancy = userRemainingQuantity !== systemCalculatedRemaining;
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

  /**
   * Get stock for multiple items (batch operation)
   * @param {string[]} itemNames - Array of item names
   * @returns {Promise<Object>} Map of itemName to stock info
   */
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

  /**
   * Search items with stock information
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Items with stock info
   */
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

    // Batch get stock for all items
    const itemNames = items.map(item => item.itemName);
    const stockMap = await this.getBatchStock(itemNames);

    return items.map(item => ({
      itemName: item.itemName,
      itemParent: item.itemParent,
      qtyOnHand: item.qtyOnHand,
      currentStock: stockMap[item.itemName]?.availableQty || 0,
      stockInfo: stockMap[item.itemName]
    }));
  }
}

module.exports = new StockCalculationService();
