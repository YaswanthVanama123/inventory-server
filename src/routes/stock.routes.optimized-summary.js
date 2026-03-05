

const RouteStarItemAlias = require('../models/RouteStarItemAlias');
async function getOptimizedSummary() {
  console.time('[StockSummary] Total time');
  console.time('[StockSummary] Step 1: Get items + aliases');
  const [forUseItems, forSellItems, aliasMap, mappings] = await Promise.all([
    RouteStarItem.find({ forUse: true }).select('itemName').lean(),
    RouteStarItem.find({ forSell: true }).select('itemName').lean(),
    RouteStarItemAlias.buildLookupMap(),
    ModelCategory.find().select('modelNumber categoryItemName').lean()
  ]);
  console.timeEnd('[StockSummary] Step 1: Get items + aliases');
  const useAllowedCategories = forUseItems.map(item => item.itemName);
  const sellAllowedCategories = forSellItems.map(item => item.itemName);
  const skuToCategoryMap = {};
  mappings.forEach(m => {
    if (m.modelNumber && m.categoryItemName) {
      skuToCategoryMap[m.modelNumber] = m.categoryItemName;
    }
  });
  const useSKUs = [];
  const sellSKUs = [];
  mappings.forEach(m => {
    if (m.categoryItemName) {
      if (useAllowedCategories.includes(m.categoryItemName)) {
        useSKUs.push(m.modelNumber);
      }
      if (sellAllowedCategories.includes(m.categoryItemName)) {
        sellSKUs.push(m.modelNumber);
      }
    }
  });
  console.log(`[StockSummary] Use categories: ${useAllowedCategories.length}, SKUs: ${useSKUs.length}`);
  console.log(`[StockSummary] Sell categories: ${sellAllowedCategories.length}, SKUs: ${sellSKUs.length}`);
  console.time('[StockSummary] Step 2: Aggregate purchases');
  const [usePurchases, sellPurchases] = await Promise.all([
    CustomerConnectOrder.aggregate([
      {
        $match: {
          status: { $in: ['Complete', 'Processing', 'Shipped'] },
          'items.sku': { $in: useSKUs }
        }
      },
      { $unwind: '$items' },
      {
        $match: {
          'items.sku': { $in: useSKUs }
        }
      },
      {
        $addFields: {
          'items.skuUpper': { $toUpper: '$items.sku' }
        }
      },
      {
        $group: {
          _id: '$items.skuUpper',
          totalQuantity: { $sum: '$items.qty' },
          totalValue: { $sum: '$items.lineTotal' },
          itemCount: { $sum: 1 }
        }
      }
    ]),
    CustomerConnectOrder.aggregate([
      {
        $match: {
          status: { $in: ['Complete', 'Processing', 'Shipped'] },
          'items.sku': { $in: sellSKUs }
        }
      },
      { $unwind: '$items' },
      {
        $match: {
          'items.sku': { $in: sellSKUs }
        }
      },
      {
        $addFields: {
          'items.skuUpper': { $toUpper: '$items.sku' }
        }
      },
      {
        $group: {
          _id: '$items.skuUpper',
          totalPurchased: { $sum: '$items.qty' },
          totalPurchaseValue: { $sum: '$items.lineTotal' },
          itemCount: { $sum: 1 }
        }
      }
    ])
  ]);
  console.timeEnd('[StockSummary] Step 2: Aggregate purchases');
  console.time('[StockSummary] Step 3: Build variations');
  const sellVariations = [];
  sellAllowedCategories.forEach(category => {
    sellVariations.push(category);
    Object.keys(aliasMap).forEach(alias => {
      if (aliasMap[alias] === category && alias !== category.toLowerCase()) {
        sellVariations.push(alias);
      }
    });
  });
  console.log(`[StockSummary] Sell variations for lookup: ${sellVariations.length}`);
  console.timeEnd('[StockSummary] Step 3: Build variations');
  console.time('[StockSummary] Step 4: Aggregate sales + checkouts + discrepancies');
  const [sales, checkouts, discrepancies] = await Promise.all([
    RouteStarInvoice.aggregate([
      {
        $match: {
          status: { $in: ['Completed', 'Closed', 'Pending'] },
          'lineItems.0': { $exists: true },
          'lineItems.name': { $in: sellVariations }
        }
      },
      { $unwind: '$lineItems' },
      {
        $match: {
          'lineItems.name': { $in: sellVariations }
        }
      },
      {
        $addFields: {
          'lineItems.nameLower': { $toLower: '$lineItems.name' }
        }
      },
      {
        $group: {
          _id: '$lineItems.nameLower',
          totalSold: { $sum: '$lineItems.quantity' },
          totalSalesValue: { $sum: '$lineItems.amount' },
          invoiceNumbers: { $addToSet: '$invoiceNumber' }
        }
      },
      {
        $project: {
          _id: 0,
          itemName: '$_id',
          totalSold: 1,
          totalSalesValue: 1,
          invoiceCount: { $size: '$invoiceNumbers' }
        }
      }
    ]),
    TruckCheckout.aggregate([
      {
        $match: {
          status: 'checked_out',
          'itemsTaken.name': { $in: sellVariations }
        }
      },
      { $unwind: '$itemsTaken' },
      {
        $match: {
          'itemsTaken.name': { $in: sellVariations }
        }
      },
      {
        $addFields: {
          'itemsTaken.nameLower': { $toLower: '$itemsTaken.name' }
        }
      },
      {
        $group: {
          _id: '$itemsTaken.nameLower',
          totalCheckedOut: { $sum: '$itemsTaken.quantity' }
        }
      },
      {
        $project: {
          _id: 0,
          itemName: '$_id',
          totalCheckedOut: 1
        }
      }
    ]),
    StockDiscrepancy.aggregate([
      {
        $match: {
          categoryName: { $in: [...sellAllowedCategories, ...sellVariations] }
        }
      },
      {
        $addFields: {
          categoryNameLower: { $toLower: '$categoryName' }
        }
      },
      {
        $group: {
          _id: '$categoryNameLower',
          totalDiscrepancies: { $sum: 1 },
          totalDiscrepancyDifference: { $sum: '$difference' },
          approvedAdjustment: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'Approved'] },
                '$difference',
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          categoryName: '$_id',
          totalDiscrepancies: 1,
          totalDiscrepancyDifference: 1,
          approvedAdjustment: 1
        }
      }
    ])
  ]);
  console.timeEnd('[StockSummary] Step 4: Aggregate sales + checkouts + discrepancies');
  console.time('[StockSummary] Step 5: Build result maps');
  const getCanonical = (name) => {
    const nameLower = name.toLowerCase();
    return aliasMap[nameLower] || name;
  };
  const useStockMap = {};
  usePurchases.forEach(p => {
    const category = skuToCategoryMap[p._id];
    if (category && useAllowedCategories.includes(category)) {
      if (!useStockMap[category]) {
        useStockMap[category] = {
          categoryName: category,
          totalQuantity: 0,
          itemCount: 0,
          totalValue: 0
        };
      }
      useStockMap[category].totalQuantity += p.totalQuantity || 0;
      useStockMap[category].totalValue += p.totalValue || 0;
      useStockMap[category].itemCount += p.itemCount || 0;
    }
  });
  forUseItems.forEach(item => {
    if (!useStockMap[item.itemName]) {
      useStockMap[item.itemName] = {
        categoryName: item.itemName,
        totalQuantity: 0,
        itemCount: 0,
        totalValue: 0
      };
    }
  });
  const sellStockMap = {};
  sellPurchases.forEach(p => {
    const category = skuToCategoryMap[p._id];
    if (category && sellAllowedCategories.includes(category)) {
      if (!sellStockMap[category]) {
        sellStockMap[category] = {
          categoryName: category,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        };
      }
      sellStockMap[category].totalPurchased += p.totalPurchased || 0;
      sellStockMap[category].totalPurchaseValue += p.totalPurchaseValue || 0;
      sellStockMap[category].itemCount += p.itemCount || 0;
    }
  });
  sales.forEach(s => {
    const canonical = getCanonical(s.itemName);
    if (sellAllowedCategories.includes(canonical)) {
      if (!sellStockMap[canonical]) {
        sellStockMap[canonical] = {
          categoryName: canonical,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        };
      }
      sellStockMap[canonical].totalSold += s.totalSold || 0;
      sellStockMap[canonical].totalSalesValue += s.totalSalesValue || 0;
      sellStockMap[canonical].invoiceCount += s.invoiceCount || 0;
    }
  });
  checkouts.forEach(c => {
    const canonical = getCanonical(c.itemName);
    if (sellAllowedCategories.includes(canonical)) {
      if (!sellStockMap[canonical]) {
        sellStockMap[canonical] = {
          categoryName: canonical,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        };
      }
      sellStockMap[canonical].totalCheckedOut += c.totalCheckedOut || 0;
    }
  });
  discrepancies.forEach(d => {
    const canonical = getCanonical(d.categoryName);
    if (sellAllowedCategories.includes(canonical)) {
      if (!sellStockMap[canonical]) {
        sellStockMap[canonical] = {
          categoryName: canonical,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        };
      }
      sellStockMap[canonical].totalDiscrepancies += d.totalDiscrepancies || 0;
      sellStockMap[canonical].totalDiscrepancyDifference += d.totalDiscrepancyDifference || 0;
      const adjustment = d.approvedAdjustment || 0;
      sellStockMap[canonical].stockRemaining =
        sellStockMap[canonical].totalPurchased -
        sellStockMap[canonical].totalSold -
        sellStockMap[canonical].totalCheckedOut +
        adjustment;
    }
  });
  forSellItems.forEach(item => {
    if (!sellStockMap[item.itemName]) {
      sellStockMap[item.itemName] = {
        categoryName: item.itemName,
        totalPurchased: 0,
        totalPurchaseValue: 0,
        totalSold: 0,
        totalSalesValue: 0,
        totalCheckedOut: 0,
        totalDiscrepancies: 0,
        totalDiscrepancyDifference: 0,
        itemCount: 0,
        invoiceCount: 0,
        stockRemaining: 0
      };
    } else if (sellStockMap[item.itemName].stockRemaining === 0) {
      sellStockMap[item.itemName].stockRemaining =
        sellStockMap[item.itemName].totalPurchased -
        sellStockMap[item.itemName].totalSold -
        sellStockMap[item.itemName].totalCheckedOut;
    }
  });
  console.timeEnd('[StockSummary] Step 5: Build result maps');
  console.time('[StockSummary] Step 6: Sort and totals');
  const useStock = Object.values(useStockMap).sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName)
  );
  const sellStock = Object.values(sellStockMap).sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName)
  );
  const useTotals = useStock.reduce((acc, item) => ({
    totalQuantity: acc.totalQuantity + item.totalQuantity,
    totalValue: acc.totalValue + item.totalValue,
    categoryCount: acc.categoryCount + 1
  }), { totalQuantity: 0, totalValue: 0, categoryCount: 0 });
  const sellTotals = sellStock.reduce((acc, item) => ({
    totalPurchased: acc.totalPurchased + item.totalPurchased,
    totalPurchaseValue: acc.totalPurchaseValue + item.totalPurchaseValue,
    totalSold: acc.totalSold + item.totalSold,
    totalSalesValue: acc.totalSalesValue + item.totalSalesValue,
    totalCheckedOut: acc.totalCheckedOut + item.totalCheckedOut,
    stockRemaining: acc.stockRemaining + item.stockRemaining,
    totalDiscrepancies: acc.totalDiscrepancies + item.totalDiscrepancies,
    totalDiscrepancyDifference: acc.totalDiscrepancyDifference + item.totalDiscrepancyDifference,
    categoryCount: acc.categoryCount + 1
  }), {
    totalPurchased: 0,
    totalPurchaseValue: 0,
    totalSold: 0,
    totalSalesValue: 0,
    totalCheckedOut: 0,
    stockRemaining: 0,
    totalDiscrepancies: 0,
    totalDiscrepancyDifference: 0,
    categoryCount: 0
  });
  console.timeEnd('[StockSummary] Step 6: Sort and totals');
  console.timeEnd('[StockSummary] Total time');
  return {
    useStock: {
      items: useStock,
      totals: useTotals
    },
    sellStock: {
      items: sellStock,
      totals: sellTotals
    }
  };
}
module.exports = { getOptimizedSummary };
