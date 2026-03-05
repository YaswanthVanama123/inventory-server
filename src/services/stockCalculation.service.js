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
      return await this._calculateStockFromSources(canonicalName, sku);
    } catch (error) {
      console.error('Error calculating current stock:', error);
      throw error;
    }
  }
  async _calculateStockFromSources(canonicalName, sku) {
    const totalPurchased = await this._calculatePurchases(canonicalName);
    const totalSold = await this._calculateSales(canonicalName);
    const totalCheckedOut = await this._calculateCheckouts(canonicalName);
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
