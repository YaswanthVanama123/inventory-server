const express = require('express');
const router = express.Router();
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * @route   GET /api/stock-reconciliation
 * @desc    Get stock reconciliation - map purchases to sales
 * @access  Private (Admin only)
 */
router.get('/', authenticate, requireAdmin(), async (req, res) => {
  try {
    console.log('[Stock Reconciliation] Starting aggregation...');

    // Get all purchased items grouped by SKU
    const purchasedItems = await CustomerConnectOrder.aggregate([
      { $match: { 'items.0': { $exists: true } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            sku: '$items.sku',
            name: '$items.name'
          },
          totalPurchased: { $sum: '$items.qty' },
          avgPurchasePrice: { $avg: '$items.unitPrice' },
          totalPurchaseValue: { $sum: '$items.lineTotal' },
          purchaseCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          sku: '$_id.sku',
          name: '$_id.name',
          totalPurchased: 1,
          avgPurchasePrice: 1,
          totalPurchaseValue: 1,
          purchaseCount: 1
        }
      }
    ]);

    // Get all sold items grouped by SKU (where SKU exists)
    const soldItemsBySKU = await RouteStarInvoice.aggregate([
      { $match: { 'lineItems.0': { $exists: true } } },
      { $unwind: '$lineItems' },
      { $match: { 'lineItems.sku': { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$lineItems.sku',
          totalSold: { $sum: '$lineItems.quantity' },
          avgSalePrice: { $avg: '$lineItems.rate' },
          totalSaleValue: { $sum: '$lineItems.amount' },
          saleCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          sku: '$_id',
          totalSold: 1,
          avgSalePrice: 1,
          totalSaleValue: 1,
          saleCount: 1
        }
      }
    ]);

    // Create a map of sold items by SKU for quick lookup
    const soldMap = {};
    soldItemsBySKU.forEach(item => {
      soldMap[item.sku] = item;
    });

    // Combine purchased and sold data
    const reconciliation = purchasedItems.map(purchase => {
      const sold = soldMap[purchase.sku] || {
        totalSold: 0,
        avgSalePrice: 0,
        totalSaleValue: 0,
        saleCount: 0
      };

      const currentStock = purchase.totalPurchased - sold.totalSold;
      const profitMargin = sold.avgSalePrice > 0
        ? ((sold.avgSalePrice - purchase.avgPurchasePrice) / sold.avgSalePrice * 100).toFixed(2)
        : 0;

      return {
        sku: purchase.sku,
        name: purchase.name,
        purchased: {
          quantity: purchase.totalPurchased,
          avgPrice: purchase.avgPurchasePrice,
          totalValue: purchase.totalPurchaseValue,
          orderCount: purchase.purchaseCount
        },
        sold: {
          quantity: sold.totalSold,
          avgPrice: sold.avgSalePrice,
          totalValue: sold.totalSaleValue,
          invoiceCount: sold.saleCount
        },
        stock: {
          current: currentStock,
          status: currentStock < 0 ? 'OVERSOLD' : currentStock === 0 ? 'OUT_OF_STOCK' : 'IN_STOCK',
          profitMargin: parseFloat(profitMargin)
        }
      };
    });

    // Sort by current stock (lowest first to show issues)
    reconciliation.sort((a, b) => a.stock.current - b.stock.current);

    // Get items that were sold but never purchased (potential data issues)
    const unmatchedSales = soldItemsBySKU
      .filter(sold => !purchasedItems.find(p => p.sku === sold.sku))
      .map(sold => ({
        sku: sold.sku,
        name: 'SOLD WITHOUT PURCHASE RECORD',
        purchased: { quantity: 0, avgPrice: 0, totalValue: 0, orderCount: 0 },
        sold: {
          quantity: sold.totalSold,
          avgPrice: sold.avgSalePrice,
          totalValue: sold.totalSaleValue,
          invoiceCount: sold.saleCount
        },
        stock: {
          current: -sold.totalSold,
          status: 'OVERSOLD',
          profitMargin: 0
        }
      }));

    const allItems = [...reconciliation, ...unmatchedSales];

    // Calculate summary statistics
    const summary = {
      totalItems: allItems.length,
      inStock: allItems.filter(i => i.stock.current > 0).length,
      outOfStock: allItems.filter(i => i.stock.current === 0).length,
      oversold: allItems.filter(i => i.stock.current < 0).length,
      totalPurchaseValue: allItems.reduce((sum, i) => sum + i.purchased.totalValue, 0),
      totalSaleValue: allItems.reduce((sum, i) => sum + i.sold.totalValue, 0),
      totalProfit: allItems.reduce((sum, i) => sum + (i.sold.totalValue - i.purchased.totalValue), 0)
    };

    console.log(`[Stock Reconciliation] Found ${allItems.length} items`);

    res.json({
      success: true,
      data: {
        items: allItems,
        summary,
        totalItems: allItems.length
      }
    });
  } catch (error) {
    console.error('Stock reconciliation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stock reconciliation',
      error: error.message
    });
  }
});

module.exports = router;
