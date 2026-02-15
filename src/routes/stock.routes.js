const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const ModelCategory = require('../models/ModelCategory');
const RouteStarItem = require('../models/RouteStarItem');

/**
 * @route   GET /api/stock/category/:categoryName/skus
 * @desc    Get all SKUs mapped to a specific category with their purchase history
 */
router.get('/category/:categoryName/skus', authenticate, async (req, res) => {
  try {
    const { categoryName } = req.params;

    // Get all mappings for this category
    const mappings = await ModelCategory.find({
      categoryItemName: categoryName
    }).lean();

    // Get all SKUs for this category
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

    // Get all orders containing these SKUs
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] },
      'items.sku': { $in: skus }
    }).lean();

    // Group purchase history by SKU
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

    // Add SKUs that have no purchase history
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

    // Convert to array and sort
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

/**
 * @route   GET /api/stock/category/:categoryName/sales
 * @desc    Get all SKUs mapped to a specific category with their purchase AND sales history
 */
router.get('/category/:categoryName/sales', authenticate, async (req, res) => {
  try {
    const { categoryName } = req.params;

    // Get all mappings for this category
    const mappings = await ModelCategory.find({
      categoryItemName: categoryName
    }).lean();

    // Get all SKUs for this category
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

    // Get all orders containing these SKUs (purchases)
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] },
      'items.sku': { $in: skus }
    }).lean();

    // Get all invoices containing line items matching this category name
    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] },
      'lineItems.name': categoryName
    }).lean();

    // Group purchase and sales history by SKU
    const skuData = {};

    // Process purchases from orders
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

    // Process sales from invoices - match by item NAME to category
    // Since invoices are at category level, we need to aggregate sales first
    let categorySalesData = {
      totalSold: 0,
      totalSalesValue: 0,
      salesHistory: []
    };

    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const itemName = item.name ? item.name.trim() : '';

          // Match invoice item name directly to the category name
          if (itemName === categoryName) {
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

    // Now distribute the category-level sales across all SKUs
    // Each SKU gets the full sales history but divided totals to avoid inflation
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

      // Add category sales to each SKU (divided to prevent inflation when aggregating)
      skuData[sku].totalSold = categorySalesData.totalSold / skuCount;
      skuData[sku].totalSalesValue = categorySalesData.totalSalesValue / skuCount;
      skuData[sku].salesHistory = [...categorySalesData.salesHistory];
    });

    // Add SKUs that have no purchase or sales history
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

    // Convert to array and sort
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

/**
 * @route   GET /api/stock/use
 * @desc    Get Use Stock summary (purchases from orders grouped by category)
 */
router.get('/use', authenticate, async (req, res) => {
  try {
    // Get RouteStar items marked for use
    const forUseItems = await RouteStarItem.find({ forUse: true }).lean();
    const allowedCategories = new Set(forUseItems.map(item => item.itemName));

    // Get all mappings to create a lookup
    const mappings = await ModelCategory.find().lean();
    const skuToCategoryMap = {};

    mappings.forEach(mapping => {
      if (mapping.modelNumber && mapping.categoryItemName) {
        skuToCategoryMap[mapping.modelNumber] = mapping.categoryItemName;
      }
    });

    // Get all orders and flatten items
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] }
    }).lean();

    // Group by category and sum quantities
    const categoryMap = {};

    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const category = skuToCategoryMap[sku];

          // Only include if category is marked for use
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

    // Add categories that have no order data but are marked for use
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

    // Convert map to array and sort by category name
    const stockData = Object.values(categoryMap).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );

    // Calculate totals
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

/**
 * @route   GET /api/stock/sell
 * @desc    Get Sell Stock summary (purchase quantities from orders for resale items)
 */
router.get('/sell', authenticate, async (req, res) => {
  try {
    // Get RouteStar items marked for sell
    const forSellItems = await RouteStarItem.find({ forSell: true }).lean();
    const allowedCategories = new Set(forSellItems.map(item => item.itemName));

    // Get all mappings to create a lookup
    const mappings = await ModelCategory.find().lean();
    const skuToCategoryMap = {};

    mappings.forEach(mapping => {
      if (mapping.modelNumber && mapping.categoryItemName) {
        skuToCategoryMap[mapping.modelNumber] = mapping.categoryItemName;
      }
    });

    // Get all orders and flatten items (show PURCHASES for sell stock)
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] }
    }).lean();

    // Get all invoices (for SALES data)
    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] }
    }).lean();

    // Group by category and sum quantities
    const categoryMap = {};

    // Process purchases from orders
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const category = skuToCategoryMap[sku];

          // Only include if category is marked for sell
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

    // Process sales from invoices - match by category name
    // Track unique invoices per category
    const categoryInvoices = {}; // Track unique invoices per category

    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const itemName = item.name ? item.name.trim() : '';

          // Match invoice item name to category and check if it's in allowed categories
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

            // Track unique invoices per category
            if (!categoryInvoices[itemName]) {
              categoryInvoices[itemName] = new Set();
            }
            categoryInvoices[itemName].add(invoice.invoiceNumber);
          }
        });
      }
    });

    // Update invoice counts based on unique invoices
    Object.keys(categoryInvoices).forEach(categoryName => {
      if (categoryMap[categoryName]) {
        categoryMap[categoryName].invoiceCount = categoryInvoices[categoryName].size;
      }
    });

    // Calculate stock remaining for each category
    Object.values(categoryMap).forEach(category => {
      category.stockRemaining = category.totalPurchased - category.totalSold;
    });

    // Add categories that have no order data but are marked for sell
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

    // Convert map to array and sort by category name
    const stockData = Object.values(categoryMap).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );

    // Calculate totals
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

/**
 * @route   GET /api/stock/summary
 * @desc    Get both Use and Sell stock summary
 */
router.get('/summary', authenticate, async (req, res) => {
  try {
    // Get RouteStar items marked for use and sell
    const forUseItems = await RouteStarItem.find({ forUse: true }).lean();
    const forSellItems = await RouteStarItem.find({ forSell: true }).lean();
    const useAllowedCategories = new Set(forUseItems.map(item => item.itemName));
    const sellAllowedCategories = new Set(forSellItems.map(item => item.itemName));

    // Get all mappings
    const mappings = await ModelCategory.find().lean();
    const skuToCategoryMap = {};

    mappings.forEach(mapping => {
      if (mapping.modelNumber && mapping.categoryItemName) {
        skuToCategoryMap[mapping.modelNumber] = mapping.categoryItemName;
      }
    });

    // Get orders data
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] }
    }).lean();

    // Get invoices data (include Pending, Closed, Completed)
    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] }
    }).lean();

    // Process Use Stock
    const useStockMap = {};
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const category = skuToCategoryMap[sku];

          // Only include if category is marked for use
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

    // Add categories that have no order data but are marked for use
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

    // Process Sell Stock - include both purchases and sales
    const sellStockMap = {};

    // Process purchases from orders
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const category = skuToCategoryMap[sku];

          // Only include if category is marked for sell
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

    // Process sales from invoices - match by category name
    // Track unique invoices per category
    const categoryInvoices = {}; // Track unique invoices per category

    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const itemName = item.name ? item.name.trim() : '';

          // Match invoice item name to category and check if it's in allowed categories
          if (sellAllowedCategories.has(itemName)) {
            if (!sellStockMap[itemName]) {
              sellStockMap[itemName] = {
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

            sellStockMap[itemName].totalSold += item.quantity || 0;
            sellStockMap[itemName].totalSalesValue += item.amount || 0;

            // Track unique invoices per category
            if (!categoryInvoices[itemName]) {
              categoryInvoices[itemName] = new Set();
            }
            categoryInvoices[itemName].add(invoice.invoiceNumber);
          }
        });
      }
    });

    // Update invoice counts based on unique invoices
    Object.keys(categoryInvoices).forEach(categoryName => {
      if (sellStockMap[categoryName]) {
        sellStockMap[categoryName].invoiceCount = categoryInvoices[categoryName].size;
      }
    });

    // Calculate stock remaining for each category
    Object.values(sellStockMap).forEach(category => {
      category.stockRemaining = category.totalPurchased - category.totalSold;
    });

    // Add categories that have no order data but are marked for sell
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

    // Convert to arrays and sort
    const useStock = Object.values(useStockMap).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );
    const sellStock = Object.values(sellStockMap).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );

    // Calculate totals
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
