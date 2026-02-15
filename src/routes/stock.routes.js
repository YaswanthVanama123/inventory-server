const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const ModelCategory = require('../models/ModelCategory');
const RouteStarItem = require('../models/RouteStarItem');

// Helper function to get merged RouteStarItems (canonical names)
async function getMergedRouteStarItems(filter = {}) {
  const RouteStarItemAlias = require('../models/RouteStarItemAlias');

  // Fetch items matching the filter
  const items = await RouteStarItem.find(filter).lean();

  // Load alias map
  const aliasMap = await RouteStarItemAlias.buildLookupMap();

  // Group by canonical names
  const groupedByCanonical = {};

  items.forEach(item => {
    const canonicalName = aliasMap[item.itemName] || item.itemName;

    if (!groupedByCanonical[canonicalName]) {
      groupedByCanonical[canonicalName] = {
        itemName: canonicalName,
        forUse: item.forUse,
        forSell: item.forSell,
        variations: []
      };
    }

    groupedByCanonical[canonicalName].variations.push(item.itemName);
    if (item.forUse) groupedByCanonical[canonicalName].forUse = true;
    if (item.forSell) groupedByCanonical[canonicalName].forSell = true;
  });

  return {
    mergedItems: Object.values(groupedByCanonical),
    aliasMap // Return the map so we can use it to convert raw names to canonical
  };
}

// Helper function to convert raw itemName to canonical name
function getCanonicalName(itemName, aliasMap) {
  return aliasMap[itemName] || itemName;
}





router.get('/category/:categoryName/skus', authenticate, async (req, res) => {
  try {
    const { categoryName } = req.params;

    
    const mappings = await ModelCategory.find({
      categoryItemName: categoryName
    }).lean();

    
    const skus = mappings.map(m => m.modelNumber);

    if (skus.length === 0) {
      return res.json({
        success: true,
        data: {
          categoryName,
          skus: []
        }
      });
    }

    
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] },
      'items.sku': { $in: skus }
    }).lean();

    
    const skuData = {};

    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';

          if (skus.includes(sku)) {
            if (!skuData[sku]) {
              skuData[sku] = {
                sku,
                itemName: item.name || '',
                totalQuantity: 0,
                totalValue: 0,
                purchaseHistory: []
              };
            }

            skuData[sku].totalQuantity += item.qty || 0;
            skuData[sku].totalValue += item.lineTotal || 0;
            skuData[sku].purchaseHistory.push({
              orderNumber: order.orderNumber,
              orderDate: order.orderDate,
              quantity: item.qty,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              vendor: order.vendor?.name || '',
              status: order.status
            });
          }
        });
      }
    });

    
    skus.forEach(sku => {
      if (!skuData[sku]) {
        const mapping = mappings.find(m => m.modelNumber === sku);
        skuData[sku] = {
          sku,
          itemName: mapping?.notes || '',
          totalQuantity: 0,
          totalValue: 0,
          purchaseHistory: []
        };
      }
    });

    
    const skuArray = Object.values(skuData).sort((a, b) =>
      a.sku.localeCompare(b.sku)
    );

    res.json({
      success: true,
      data: {
        categoryName,
        skus: skuArray
      }
    });
  } catch (error) {
    console.error('Error fetching category SKUs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category SKUs',
      error: error.message
    });
  }
});





router.get('/category/:categoryName/sales', authenticate, async (req, res) => {
  try {
    const { categoryName } = req.params;

    // Load alias map to handle item name variations
    const RouteStarItemAlias = require('../models/RouteStarItemAlias');
    const aliasMap = await RouteStarItemAlias.buildLookupMap();

    // Find all variations (aliases) that map to this canonical name
    const variations = [categoryName]; // Include the canonical name itself
    Object.keys(aliasMap).forEach(alias => {
      if (aliasMap[alias] === categoryName) {
        variations.push(alias);
      }
    });

    console.log(`Finding invoices for category: ${categoryName}, variations:`, variations);

    // Get mappings for the category
    const mappings = await ModelCategory.find({
      categoryItemName: categoryName
    }).lean();


    const skus = mappings.map(m => m.modelNumber);

    if (skus.length === 0) {
      return res.json({
        success: true,
        data: {
          categoryName,
          skus: []
        }
      });
    }


    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] },
      'items.sku': { $in: skus }
    }).lean();

    // Fetch invoices that have ANY variation of the category name
    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] },
      'lineItems.name': { $in: variations }
    }).lean();

    
    const skuData = {};

    
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';

          if (skus.includes(sku)) {
            if (!skuData[sku]) {
              skuData[sku] = {
                sku,
                itemName: item.name || '',
                totalPurchased: 0,
                totalPurchaseValue: 0,
                totalSold: 0,
                totalSalesValue: 0,
                purchaseHistory: [],
                salesHistory: []
              };
            }

            skuData[sku].totalPurchased += item.qty || 0;
            skuData[sku].totalPurchaseValue += item.lineTotal || 0;
            skuData[sku].purchaseHistory.push({
              orderNumber: order.orderNumber,
              orderDate: order.orderDate,
              quantity: item.qty,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              vendor: order.vendor?.name || '',
              status: order.status
            });
          }
        });
      }
    });

    
    
    let categorySalesData = {
      totalSold: 0,
      totalSalesValue: 0,
      salesHistory: []
    };

    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const rawItemName = item.name ? item.name.trim() : '';
          // Map raw item name to canonical name
          const canonicalItemName = getCanonicalName(rawItemName, aliasMap);

          // Check if canonical name matches the category
          if (canonicalItemName === categoryName) {
            categorySalesData.totalSold += item.quantity || 0;
            categorySalesData.totalSalesValue += item.amount || 0;
            categorySalesData.salesHistory.push({
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount,
              customer: invoice.customer?.name || '',
              status: invoice.status
            });
          }
        });
      }
    });

    
    
    const skuCount = skus.length || 1;
    skus.forEach(sku => {
      if (!skuData[sku]) {
        const mapping = mappings.find(m => m.modelNumber === sku);
        skuData[sku] = {
          sku,
          itemName: mapping?.notes || '',
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSalesValue: 0,
          purchaseHistory: [],
          salesHistory: []
        };
      }

      
      skuData[sku].totalSold = categorySalesData.totalSold / skuCount;
      skuData[sku].totalSalesValue = categorySalesData.totalSalesValue / skuCount;
      skuData[sku].salesHistory = [...categorySalesData.salesHistory];
    });

    
    skus.forEach(sku => {
      if (!skuData[sku]) {
        const mapping = mappings.find(m => m.modelNumber === sku);
        skuData[sku] = {
          sku,
          itemName: mapping?.notes || '',
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSalesValue: 0,
          purchaseHistory: [],
          salesHistory: []
        };
      }
    });

    
    const skuArray = Object.values(skuData).sort((a, b) =>
      a.sku.localeCompare(b.sku)
    );

    res.json({
      success: true,
      data: {
        categoryName,
        skus: skuArray
      }
    });
  } catch (error) {
    console.error('Error fetching category sales:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category sales',
      error: error.message
    });
  }
});





router.get('/use', authenticate, async (req, res) => {
  try {
    
    const forUseItems = await RouteStarItem.find({ forUse: true }).lean();
    const allowedCategories = new Set(forUseItems.map(item => item.itemName));

    
    const mappings = await ModelCategory.find().lean();
    const skuToCategoryMap = {};

    mappings.forEach(mapping => {
      if (mapping.modelNumber && mapping.categoryItemName) {
        skuToCategoryMap[mapping.modelNumber] = mapping.categoryItemName;
      }
    });

    
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] }
    }).lean();

    
    const categoryMap = {};

    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const category = skuToCategoryMap[sku];

          
          if (category && allowedCategories.has(category)) {
            if (!categoryMap[category]) {
              categoryMap[category] = {
                categoryName: category,
                totalQuantity: 0,
                itemCount: 0,
                totalValue: 0
              };
            }

            categoryMap[category].totalQuantity += item.qty || 0;
            categoryMap[category].itemCount += 1;
            categoryMap[category].totalValue += item.lineTotal || 0;
          }
        });
      }
    });

    
    forUseItems.forEach(item => {
      if (!categoryMap[item.itemName]) {
        categoryMap[item.itemName] = {
          categoryName: item.itemName,
          totalQuantity: 0,
          itemCount: 0,
          totalValue: 0
        };
      }
    });

    
    const stockData = Object.values(categoryMap).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );

    
    const totals = stockData.reduce((acc, item) => ({
      totalQuantity: acc.totalQuantity + item.totalQuantity,
      totalValue: acc.totalValue + item.totalValue,
      categoryCount: acc.categoryCount + 1
    }), { totalQuantity: 0, totalValue: 0, categoryCount: 0 });

    res.json({
      success: true,
      data: {
        items: stockData,
        totals
      }
    });
  } catch (error) {
    console.error('Error fetching use stock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch use stock data',
      error: error.message
    });
  }
});





router.get('/sell', authenticate, async (req, res) => {
  try {
    
    const forSellItems = await RouteStarItem.find({ forSell: true }).lean();
    const allowedCategories = new Set(forSellItems.map(item => item.itemName));

    
    const mappings = await ModelCategory.find().lean();
    const skuToCategoryMap = {};

    mappings.forEach(mapping => {
      if (mapping.modelNumber && mapping.categoryItemName) {
        skuToCategoryMap[mapping.modelNumber] = mapping.categoryItemName;
      }
    });

    
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] }
    }).lean();

    
    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] }
    }).lean();

    
    const categoryMap = {};

    
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const category = skuToCategoryMap[sku];

          
          if (category && allowedCategories.has(category)) {
            if (!categoryMap[category]) {
              categoryMap[category] = {
                categoryName: category,
                totalPurchased: 0,
                totalPurchaseValue: 0,
                totalSold: 0,
                totalSalesValue: 0,
                itemCount: 0,
                invoiceCount: 0,
                stockRemaining: 0
              };
            }

            categoryMap[category].totalPurchased += item.qty || 0;
            categoryMap[category].totalPurchaseValue += item.lineTotal || 0;
            categoryMap[category].itemCount += 1;
          }
        });
      }
    });

    
    
    const categoryInvoices = {}; 

    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const itemName = item.name ? item.name.trim() : '';

          
          if (allowedCategories.has(itemName)) {
            if (!categoryMap[itemName]) {
              categoryMap[itemName] = {
                categoryName: itemName,
                totalPurchased: 0,
                totalPurchaseValue: 0,
                totalSold: 0,
                totalSalesValue: 0,
                itemCount: 0,
                invoiceCount: 0,
                stockRemaining: 0
              };
            }

            categoryMap[itemName].totalSold += item.quantity || 0;
            categoryMap[itemName].totalSalesValue += item.amount || 0;

            
            if (!categoryInvoices[itemName]) {
              categoryInvoices[itemName] = new Set();
            }
            categoryInvoices[itemName].add(invoice.invoiceNumber);
          }
        });
      }
    });

    
    Object.keys(categoryInvoices).forEach(categoryName => {
      if (categoryMap[categoryName]) {
        categoryMap[categoryName].invoiceCount = categoryInvoices[categoryName].size;
      }
    });

    
    Object.values(categoryMap).forEach(category => {
      category.stockRemaining = category.totalPurchased - category.totalSold;
    });

    
    forSellItems.forEach(item => {
      if (!categoryMap[item.itemName]) {
        categoryMap[item.itemName] = {
          categoryName: item.itemName,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSalesValue: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        };
      }
    });

    
    const stockData = Object.values(categoryMap).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );

    
    const totals = stockData.reduce((acc, item) => ({
      totalPurchased: acc.totalPurchased + item.totalPurchased,
      totalPurchaseValue: acc.totalPurchaseValue + item.totalPurchaseValue,
      totalSold: acc.totalSold + item.totalSold,
      totalSalesValue: acc.totalSalesValue + item.totalSalesValue,
      stockRemaining: acc.stockRemaining + item.stockRemaining,
      categoryCount: acc.categoryCount + 1
    }), {
      totalPurchased: 0,
      totalPurchaseValue: 0,
      totalSold: 0,
      totalSalesValue: 0,
      stockRemaining: 0,
      categoryCount: 0
    });

    res.json({
      success: true,
      data: {
        items: stockData,
        totals
      }
    });
  } catch (error) {
    console.error('Error fetching sell stock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sell stock data',
      error: error.message
    });
  }
});





router.get('/summary', authenticate, async (req, res) => {
  try {
    // Get merged items with canonical names
    const { mergedItems: forUseItems, aliasMap: useAliasMap } = await getMergedRouteStarItems({ forUse: true });
    const { mergedItems: forSellItems, aliasMap: sellAliasMap } = await getMergedRouteStarItems({ forSell: true });
    const useAllowedCategories = new Set(forUseItems.map(item => item.itemName));
    const sellAllowedCategories = new Set(forSellItems.map(item => item.itemName));

    
    const mappings = await ModelCategory.find().lean();
    const skuToCategoryMap = {};

    mappings.forEach(mapping => {
      if (mapping.modelNumber && mapping.categoryItemName) {
        skuToCategoryMap[mapping.modelNumber] = mapping.categoryItemName;
      }
    });

    
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] }
    }).lean();

    
    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] }
    }).lean();

    
    const useStockMap = {};
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const category = skuToCategoryMap[sku];

          
          if (category && useAllowedCategories.has(category)) {
            if (!useStockMap[category]) {
              useStockMap[category] = {
                categoryName: category,
                totalQuantity: 0,
                itemCount: 0,
                totalValue: 0
              };
            }

            useStockMap[category].totalQuantity += item.qty || 0;
            useStockMap[category].itemCount += 1;
            useStockMap[category].totalValue += item.lineTotal || 0;
          }
        });
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

    
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const category = skuToCategoryMap[sku];

          
          if (category && sellAllowedCategories.has(category)) {
            if (!sellStockMap[category]) {
              sellStockMap[category] = {
                categoryName: category,
                totalPurchased: 0,
                totalPurchaseValue: 0,
                totalSold: 0,
                totalSalesValue: 0,
                itemCount: 0,
                invoiceCount: 0,
                stockRemaining: 0
              };
            }

            sellStockMap[category].totalPurchased += item.qty || 0;
            sellStockMap[category].totalPurchaseValue += item.lineTotal || 0;
            sellStockMap[category].itemCount += 1;
          }
        });
      }
    });

    
    
    const categoryInvoices = {}; 

    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const rawItemName = item.name ? item.name.trim() : '';
          // Map raw item name to canonical name
          const canonicalItemName = getCanonicalName(rawItemName, sellAliasMap);

          // Check if canonical name is in allowed categories
          if (sellAllowedCategories.has(canonicalItemName)) {
            if (!sellStockMap[canonicalItemName]) {
              sellStockMap[canonicalItemName] = {
                categoryName: canonicalItemName,
                totalPurchased: 0,
                totalPurchaseValue: 0,
                totalSold: 0,
                totalSalesValue: 0,
                itemCount: 0,
                invoiceCount: 0,
                stockRemaining: 0
              };
            }

            sellStockMap[canonicalItemName].totalSold += item.quantity || 0;
            sellStockMap[canonicalItemName].totalSalesValue += item.amount || 0;

            // Track invoice count
            if (!categoryInvoices[canonicalItemName]) {
              categoryInvoices[canonicalItemName] = new Set();
            }
            categoryInvoices[canonicalItemName].add(invoice.invoiceNumber);
          }
        });
      }
    });

    
    Object.keys(categoryInvoices).forEach(categoryName => {
      if (sellStockMap[categoryName]) {
        sellStockMap[categoryName].invoiceCount = categoryInvoices[categoryName].size;
      }
    });

    
    Object.values(sellStockMap).forEach(category => {
      category.stockRemaining = category.totalPurchased - category.totalSold;
    });

    
    forSellItems.forEach(item => {
      if (!sellStockMap[item.itemName]) {
        sellStockMap[item.itemName] = {
          categoryName: item.itemName,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSalesValue: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        };
      }
    });

    
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
      stockRemaining: acc.stockRemaining + item.stockRemaining,
      categoryCount: acc.categoryCount + 1
    }), {
      totalPurchased: 0,
      totalPurchaseValue: 0,
      totalSold: 0,
      totalSalesValue: 0,
      stockRemaining: 0,
      categoryCount: 0
    });

    res.json({
      success: true,
      data: {
        useStock: {
          items: useStock,
          totals: useTotals
        },
        sellStock: {
          items: sellStock,
          totals: sellTotals
        }
      }
    });
  } catch (error) {
    console.error('Error fetching stock summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stock summary',
      error: error.message
    });
  }
});

module.exports = router;
