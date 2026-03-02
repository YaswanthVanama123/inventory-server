const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const TruckCheckout = require('../models/TruckCheckout');
const ModelCategory = require('../models/ModelCategory');
const RouteStarItem = require('../models/RouteStarItem');
const StockDiscrepancy = require('../models/StockDiscrepancy');

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
    const canonicalName = aliasMap[item.itemName.toLowerCase()] || item.itemName;

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
  return aliasMap[itemName.toLowerCase()] || itemName;
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

    // Extract RouteStarItem names from SKU descriptions to find sales
    // This helps match invoices that have line items like "WHITE", "BLACK", etc.
    const routeStarItemNames = new Set([categoryName]); // Start with parent category
    const categoryKeywords = ['WHITE', 'BLACK', 'BLUE', 'RED', 'GREEN', 'YELLOW', 'BROWN', 'GRAY', 'GREY', 'ORANGE', 'PINK', 'PURPLE'];

    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] },
      'items.sku': { $in: skus }
    }).lean();

    // Extract RouteStarItem names from actual order items (where the real itemName is)
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          if (skus.includes(item.sku?.toUpperCase())) {
            const itemNameUpper = (item.name || '').toUpperCase();
            categoryKeywords.forEach(keyword => {
              if (itemNameUpper.includes(keyword)) {
                routeStarItemNames.add(keyword);
              }
            });
          }
        });
      }
    });

    // Add extracted RouteStarItem names to variations for invoice search
    const expandedVariations = [...variations, ...Array.from(routeStarItemNames)];
    console.log(`Expanded variations for invoice search:`, expandedVariations);

    // Fetch invoices that have ANY variation of the category name OR RouteStarItem names
    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] },
      'lineItems.name': { $in: expandedVariations }
    }).lean();

    // Fetch active checkouts that have ANY variation of the category name OR RouteStarItem names
    const checkouts = await TruckCheckout.find({
      status: 'checked_out',
      'itemsTaken.name': { $in: expandedVariations }
    }).lean();

    // Fetch discrepancies for this category AND for any RouteStarItem names extracted from SKUs
    // This handles both ModelCategory-level and RouteStarItem-level discrepancies
    const itemNamesInSales = new Set();
    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const rawItemName = item.name ? item.name.trim() : '';
          const canonicalItemName = getCanonicalName(rawItemName, aliasMap);
          if (expandedVariations.includes(canonicalItemName)) {
            itemNamesInSales.add(canonicalItemName);
          }
        });
      }
    });

    // Query for discrepancies matching this category OR any of its RouteStarItem names
    const discrepancies = await StockDiscrepancy.find({
      $or: [
        { categoryName: categoryName },  // ModelCategory level
        { categoryName: { $in: Array.from(routeStarItemNames) } }  // RouteStarItem level (WHITE, BLACK, etc.)
      ]
    })
      .populate('reportedBy', 'username fullName')
      .populate('resolvedBy', 'username fullName')
      .lean();

    console.log(`\n=== CATEGORY SKU DISCREPANCY DEBUG for ${categoryName} ===`);
    console.log(`Extracted RouteStarItem names from SKUs:`, Array.from(routeStarItemNames));
    console.log(`Item names in sales:`, Array.from(itemNamesInSales));
    console.log(`Found ${discrepancies.length} discrepancies`);
    discrepancies.forEach(d => {
      console.log(`  Discrepancy ID: ${d._id}`);
      console.log(`    itemName: "${d.itemName}"`);
      console.log(`    categoryName: "${d.categoryName}"`);
      console.log(`    difference: ${d.difference}`);
      console.log(`    status: ${d.status}`);
    });
    console.log('====================================\n');

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
                totalCheckedOut: 0,
                purchaseHistory: [],
                salesHistory: [],
                checkoutHistory: [],
                discrepancyHistory: []
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



    let categoryCheckoutData = {
      totalCheckedOut: 0,
      checkoutHistory: []
    };

    checkouts.forEach(checkout => {
      if (checkout.itemsTaken && Array.isArray(checkout.itemsTaken)) {
        checkout.itemsTaken.forEach(item => {
          const rawItemName = item.name ? item.name.trim() : '';
          // Map raw item name to canonical name
          const canonicalItemName = getCanonicalName(rawItemName, aliasMap);

          // Check if canonical name matches the category
          if (canonicalItemName === categoryName) {
            categoryCheckoutData.totalCheckedOut += item.quantity || 0;
            categoryCheckoutData.checkoutHistory.push({
              employeeName: checkout.employeeName,
              truckNumber: checkout.truckNumber,
              checkoutDate: checkout.checkoutDate,
              quantity: item.quantity,
              notes: item.notes || ''
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
          totalCheckedOut: 0,
          purchaseHistory: [],
          salesHistory: [],
          checkoutHistory: []
        };
      }


      skuData[sku].totalSold = categorySalesData.totalSold / skuCount;
      skuData[sku].totalSalesValue = categorySalesData.totalSalesValue / skuCount;
      skuData[sku].salesHistory = [...categorySalesData.salesHistory];


      skuData[sku].totalCheckedOut = categoryCheckoutData.totalCheckedOut / skuCount;
      skuData[sku].checkoutHistory = [...categoryCheckoutData.checkoutHistory];
    });

    // Add discrepancy history to SKU data - match by item category
    // Group discrepancies by categoryName for efficient matching
    const discrepanciesByCategory = {};
    discrepancies.forEach(d => {
      if (!discrepanciesByCategory[d.categoryName]) {
        discrepanciesByCategory[d.categoryName] = [];
      }
      discrepanciesByCategory[d.categoryName].push({
        invoiceNumber: d.invoiceNumber,
        reportedAt: d.reportedAt,
        systemQuantity: d.systemQuantity,
        actualQuantity: d.actualQuantity,
        difference: d.difference,
        discrepancyType: d.discrepancyType,
        status: d.status,
        reason: d.reason,
        notes: d.notes,
        reportedBy: d.reportedBy,
        resolvedBy: d.resolvedBy,
        resolvedAt: d.resolvedAt,
        resolutionNotes: d.resolutionNotes
      });
    });

    // Assign discrepancies to SKUs and calculate adjustments
    skus.forEach(sku => {
      if (skuData[sku]) {
        // Find which item categories this SKU is associated with (from sales)
        const skuItemCategories = new Set();
        if (skuData[sku].salesHistory) {
          // This SKU sold items - check which categories
          // Since sales are distributed evenly, we need to check original invoice data
          // For now, we'll match based on the parent categoryName or check itemName
        }

        // Try to extract category from SKU's itemName
        const itemNameUpper = skuData[sku].itemName.toUpperCase();
        let matchedCategory = null;

        // Check common keywords that might indicate the category
        const categoryKeywords = ['WHITE', 'BLACK', 'BLUE', 'RED', 'GREEN', 'YELLOW', 'BROWN', 'GRAY', 'GREY', 'ORANGE', 'PINK', 'PURPLE'];
        for (const keyword of categoryKeywords) {
          if (itemNameUpper.includes(keyword)) {
            matchedCategory = keyword;
            break;
          }
        }

        // Assign discrepancies that match this SKU's category
        skuData[sku].discrepancyHistory = [];
        let skuDiscrepancyAdjustment = 0;

        if (matchedCategory && discrepanciesByCategory[matchedCategory]) {
          // This SKU matches a specific item category - assign those discrepancies
          skuData[sku].discrepancyHistory = discrepanciesByCategory[matchedCategory];

          // Calculate adjustment for approved discrepancies
          discrepanciesByCategory[matchedCategory].forEach(d => {
            if (d.status === 'Approved' && d.difference !== undefined) {
              skuDiscrepancyAdjustment += d.difference;
            }
          });
        } else if (discrepanciesByCategory[categoryName]) {
          // No specific match - use parent category discrepancies and distribute
          skuData[sku].discrepancyHistory = discrepanciesByCategory[categoryName];

          const categoryDiscrepancyTotal = discrepanciesByCategory[categoryName]
            .filter(d => d.status === 'Approved' && d.difference !== undefined)
            .reduce((sum, d) => sum + d.difference, 0);

          skuDiscrepancyAdjustment = categoryDiscrepancyTotal / skuCount;
        }

        // Calculate stock remaining with approved discrepancy adjustments
        skuData[sku].stockRemaining = skuData[sku].totalPurchased - skuData[sku].totalSold - skuData[sku].totalCheckedOut + skuDiscrepancyAdjustment;
      }
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
          totalCheckedOut: 0,
          purchaseHistory: [],
          salesHistory: [],
          checkoutHistory: [],
          discrepancyHistory: [...categoryDiscrepancyHistory],
          stockRemaining: adjustmentPerSku  // Only approved adjustments apply if no purchases/sales
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
    // Get all forSell items
    const forSellItems = await RouteStarItem.find({ forSell: true }).lean();
    const allowedCategories = new Set(forSellItems.map(item => item.itemName));

    // Get ModelCategory mappings (SKU to category mapping)
    const mappings = await ModelCategory.find().lean();
    const skuToCategoryMap = {};

    mappings.forEach(mapping => {
      if (mapping.modelNumber && mapping.categoryItemName) {
        skuToCategoryMap[mapping.modelNumber] = mapping.categoryItemName;
      }
    });

    // Get CustomerConnect orders (purchases)
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] }
    }).lean();

    // Get RouteStar invoices (sales)
    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] }
    }).lean();

    // Get active truck checkouts (checked_out status only)
    const checkouts = await TruckCheckout.find({
      status: 'checked_out'
    }).lean();

    // Build category map
    const categoryMap = {};

    // Calculate purchases for each category
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const category = skuToCategoryMap[sku];

          // Only process if category is in allowed categories
          if (category && allowedCategories.has(category)) {
            if (!categoryMap[category]) {
              categoryMap[category] = {
                categoryName: category,
                totalPurchased: 0,
                totalPurchaseValue: 0,
                totalSold: 0,
                totalSalesValue: 0,
                totalCheckedOut: 0,
                totalDiscrepancies: 0,
                totalDiscrepancyDifference: 0,  // Total difference amount
                checkoutDetails: [],
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

    // Calculate sales for each category using alias mapping
    const RouteStarItemAlias = require('../models/RouteStarItemAlias');
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    const categoryInvoices = {}; // Track unique invoices per category

    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const rawItemName = item.name ? item.name.trim() : '';
          const itemNameLower = rawItemName.toLowerCase();
          const canonicalName = aliasMap[itemNameLower] || rawItemName;

          // Check if canonical name is in allowed categories
          if (allowedCategories.has(canonicalName)) {
            if (!categoryMap[canonicalName]) {
              categoryMap[canonicalName] = {
                categoryName: canonicalName,
                totalPurchased: 0,
                totalPurchaseValue: 0,
                totalSold: 0,
                totalSalesValue: 0,
                totalCheckedOut: 0,
                totalDiscrepancies: 0,
                totalDiscrepancyDifference: 0,  // Total difference amount
                checkoutDetails: [],
                itemCount: 0,
                invoiceCount: 0,
                stockRemaining: 0
              };
            }

            categoryMap[canonicalName].totalSold += item.quantity || 0;
            categoryMap[canonicalName].totalSalesValue += item.amount || 0;

            // Track invoice count
            if (!categoryInvoices[canonicalName]) {
              categoryInvoices[canonicalName] = new Set();
            }
            categoryInvoices[canonicalName].add(invoice.invoiceNumber);
          }
        });
      }
    });

    // Calculate checked out quantities for each category
    checkouts.forEach(checkout => {
      if (checkout.itemsTaken && Array.isArray(checkout.itemsTaken)) {
        checkout.itemsTaken.forEach(item => {
          const itemName = item.name ? item.name.trim() : '';
          const itemNameLower = itemName.toLowerCase();
          const canonicalName = aliasMap[itemNameLower] || itemName;

          if (allowedCategories.has(canonicalName)) {
            if (!categoryMap[canonicalName]) {
              categoryMap[canonicalName] = {
                categoryName: canonicalName,
                totalPurchased: 0,
                totalPurchaseValue: 0,
                totalSold: 0,
                totalSalesValue: 0,
                totalCheckedOut: 0,
                checkoutDetails: [],
                itemCount: 0,
                invoiceCount: 0,
                stockRemaining: 0
              };
            }

            categoryMap[canonicalName].totalCheckedOut += item.quantity || 0;
            categoryMap[canonicalName].checkoutDetails.push({
              employeeName: checkout.employeeName,
              truckNumber: checkout.truckNumber,
              quantity: item.quantity,
              checkoutDate: checkout.checkoutDate
            });
          }
        });
      }
    });

    // Update invoice counts
    Object.keys(categoryInvoices).forEach(categoryName => {
      if (categoryMap[categoryName]) {
        categoryMap[categoryName].invoiceCount = categoryInvoices[categoryName].size;
      }
    });

    // Fetch and count discrepancies for each category
    // Only search by categoryName field (not itemName) for accurate matching
    const discrepancies = await StockDiscrepancy.find({
      categoryName: { $in: Array.from(allowedCategories) }
    })
      .populate('reportedBy', 'username fullName')
      .populate('resolvedBy', 'username fullName')
      .lean();

    console.log('=== DISCREPANCY DEBUG ===');
    console.log('Allowed categories:', Array.from(allowedCategories).slice(0, 10)); // Show first 10
    console.log('Found discrepancies:', discrepancies.length);
    discrepancies.forEach(d => {
      console.log(`  - ID: ${d._id}, itemName: "${d.itemName}", categoryName: "${d.categoryName}", status: ${d.status}, diff: ${d.difference}`);
    });
    console.log('========================');

    // Track which discrepancies have been assigned to which categories to prevent double-counting
    const processedDiscrepancies = new Set();

    // Count discrepancies and apply approved adjustments to stock
    discrepancies.forEach(discrepancy => {
      const matchedCategory = discrepancy.categoryName;

      if (!matchedCategory) {
        console.log(`Skipping discrepancy ${discrepancy._id}: No categoryName set`);
        return;
      }

      console.log(`Processing discrepancy ${discrepancy._id}: categoryName="${discrepancy.categoryName}", status: ${discrepancy.status}, difference: ${discrepancy.difference}`);

      // Only count this discrepancy once per category
      const discrepancyKey = `${discrepancy._id}-${matchedCategory}`;
      if (processedDiscrepancies.has(discrepancyKey)) {
        console.log(`  -> Already counted for category ${matchedCategory}, skipping`);
        return;
      }

      if (allowedCategories.has(matchedCategory) && categoryMap[matchedCategory]) {
        categoryMap[matchedCategory].totalDiscrepancies += 1;
        categoryMap[matchedCategory].totalDiscrepancyDifference += (discrepancy.difference || 0);
        processedDiscrepancies.add(discrepancyKey);
        console.log(`  -> Added to ${matchedCategory}: count=${categoryMap[matchedCategory].totalDiscrepancies}, diff total=${categoryMap[matchedCategory].totalDiscrepancyDifference}`);

        // Apply approved discrepancy adjustments to stock
        if (discrepancy.status === 'Approved' && discrepancy.difference !== undefined) {
          if (!categoryMap[matchedCategory].discrepancyAdjustment) {
            categoryMap[matchedCategory].discrepancyAdjustment = 0;
          }
          categoryMap[matchedCategory].discrepancyAdjustment += discrepancy.difference;
          console.log(`  -> Applied adjustment ${discrepancy.difference} to ${matchedCategory}, total adjustment now: ${categoryMap[matchedCategory].discrepancyAdjustment}`);
        }
      } else {
        console.log(`  -> Category ${matchedCategory} not found in allowedCategories or categoryMap`);
      }
    });

    // Calculate remaining stock: Purchased - Sold - CheckedOut + Approved Discrepancy Adjustments
    Object.values(categoryMap).forEach(category => {
      const adjustment = category.discrepancyAdjustment || 0;
      category.stockRemaining = category.totalPurchased - category.totalSold - category.totalCheckedOut + adjustment;
      // Clean up temporary field
      delete category.discrepancyAdjustment;
    });

    // Ensure all forSell items have an entry
    forSellItems.forEach(item => {
      if (!categoryMap[item.itemName]) {
        categoryMap[item.itemName] = {
          categoryName: item.itemName,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          checkoutDetails: [],
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        };
      }
    });

    // Transform to array and sort
    const stockData = Object.values(categoryMap).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );

    // Calculate totals
    const totals = stockData.reduce((acc, item) => ({
      totalPurchased: acc.totalPurchased + item.totalPurchased,
      totalPurchaseValue: acc.totalPurchaseValue + item.totalPurchaseValue,
      totalSold: acc.totalSold + item.totalSold,
      totalSalesValue: acc.totalSalesValue + item.totalSalesValue,
      totalCheckedOut: acc.totalCheckedOut + item.totalCheckedOut,
      stockRemaining: acc.stockRemaining + item.stockRemaining,
      totalDiscrepancies: acc.totalDiscrepancies + item.totalDiscrepancies,
      totalDiscrepancyDifference: acc.totalDiscrepancyDifference + (item.totalDiscrepancyDifference || 0),
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





// ULTRA-OPTIMIZED /summary endpoint - Single mega-aggregation
router.get('/summary', authenticate, async (req, res) => {
  try {
    console.time('[StockSummary] Total time');

    // Step 1: Get metadata in parallel - OPTIMIZED
    console.time('[StockSummary] Step 1: Metadata');
    const RouteStarItemAlias = require('../models/RouteStarItemAlias');
    const [forUseItems, forSellItems, aliasData, mappings] = await Promise.all([
      RouteStarItem.find({ forUse: true }).select('itemName').lean(),
      RouteStarItem.find({ forSell: true }).select('itemName').lean(),
      RouteStarItemAlias.find({ isActive: true }).select('canonicalName aliases.name').lean(),
      ModelCategory.find().select('modelNumber categoryItemName').lean()
    ]);
    console.timeEnd('[StockSummary] Step 1: Metadata');

    // Build Sets for O(1) lookups
    const useAllowedSet = new Set(forUseItems.map(item => item.itemName));
    const sellAllowedSet = new Set(forSellItems.map(item => item.itemName));

    // Build SKU arrays and maps with Sets
    console.time('[StockSummary] Step 1.5: Build SKU maps');
    const skuToCategoryMap = new Map();
    const useSKUs = [];
    const sellSKUs = [];

    mappings.forEach(m => {
      if (m.modelNumber && m.categoryItemName) {
        skuToCategoryMap.set(m.modelNumber, m.categoryItemName);
        if (useAllowedSet.has(m.categoryItemName)) {
          useSKUs.push(m.modelNumber);
        }
        if (sellAllowedSet.has(m.categoryItemName)) {
          sellSKUs.push(m.modelNumber);
        }
      }
    });

    // Build alias map and variations EFFICIENTLY
    const aliasToCanonicalMap = new Map();
    const sellVariationsSet = new Set();

    // Add canonical names
    sellAllowedSet.forEach(c => {
      sellVariationsSet.add(c);
      sellVariationsSet.add(c.toLowerCase());
    });

    // Add aliases
    aliasData.forEach(mapping => {
      if (sellAllowedSet.has(mapping.canonicalName)) {
        mapping.aliases.forEach(alias => {
          const aliasLower = alias.name.toLowerCase();
          aliasToCanonicalMap.set(aliasLower, mapping.canonicalName);
          sellVariationsSet.add(alias.name);
          sellVariationsSet.add(aliasLower);
        });
      }
    });

    const sellVariationsArray = Array.from(sellVariationsSet);
    console.timeEnd('[StockSummary] Step 1.5: Build SKU maps');

    console.log(`[StockSummary] Use: ${useAllowedSet.size} cats, ${useSKUs.length} SKUs | Sell: ${sellAllowedSet.size} cats, ${sellVariationsArray.length} vars`);

    // Step 2: MEGA AGGREGATION - Get everything in parallel
    console.time('[StockSummary] Step 2: Mega query');

    const [ordersResult, invoicesResult, checkoutsResult, discrepanciesResult] = await Promise.all([
      // Orders with $facet
      (useSKUs.length > 0 || sellSKUs.length > 0) ? CustomerConnectOrder.aggregate([
        {
          $match: {
            status: { $in: ['Complete', 'Processing', 'Shipped'] },
            'items.sku': { $in: [...useSKUs, ...sellSKUs] }
          }
        },
        { $unwind: '$items' },
        {
          $match: {
            'items.sku': { $in: [...useSKUs, ...sellSKUs] }
          }
        },
        {
          $addFields: {
            'items.skuUpper': { $toUpper: '$items.sku' }
          }
        },
        {
          $facet: {
            usePurchases: [
              { $match: { 'items.sku': { $in: useSKUs } } },
              {
                $group: {
                  _id: '$items.skuUpper',
                  totalQuantity: { $sum: '$items.qty' },
                  totalValue: { $sum: '$items.lineTotal' },
                  itemCount: { $sum: 1 }
                }
              }
            ],
            sellPurchases: [
              { $match: { 'items.sku': { $in: sellSKUs } } },
              {
                $group: {
                  _id: '$items.skuUpper',
                  totalPurchased: { $sum: '$items.qty' },
                  totalPurchaseValue: { $sum: '$items.lineTotal' },
                  itemCount: { $sum: 1 }
                }
              }
            ]
          }
        }
      ]) : Promise.resolve([{ usePurchases: [], sellPurchases: [] }]),

      // Invoices
      sellVariationsArray.length > 0 ? RouteStarInvoice.aggregate([
        {
          $match: {
            status: { $in: ['Completed', 'Closed', 'Pending'] },
            'lineItems.0': { $exists: true },
            'lineItems.name': { $in: sellVariationsArray }
          }
        },
        { $unwind: '$lineItems' },
        {
          $match: {
            'lineItems.name': { $in: sellVariationsArray }
          }
        },
        {
          $group: {
            _id: { $toLower: '$lineItems.name' },
            totalSold: { $sum: '$lineItems.quantity' },
            totalSalesValue: { $sum: '$lineItems.amount' },
            invoiceNumbers: { $addToSet: '$invoiceNumber' }
          }
        },
        {
          $project: {
            itemName: '$_id',
            totalSold: 1,
            totalSalesValue: 1,
            invoiceCount: { $size: '$invoiceNumbers' },
            _id: 0
          }
        }
      ]) : Promise.resolve([]),

      // Checkouts
      sellVariationsArray.length > 0 ? TruckCheckout.aggregate([
        {
          $match: {
            status: 'checked_out',
            'itemsTaken.0': { $exists: true },
            'itemsTaken.name': { $in: sellVariationsArray }
          }
        },
        { $unwind: '$itemsTaken' },
        {
          $match: {
            'itemsTaken.name': { $in: sellVariationsArray }
          }
        },
        {
          $group: {
            _id: { $toLower: '$itemsTaken.name' },
            totalCheckedOut: { $sum: '$itemsTaken.quantity' }
          }
        },
        {
          $project: {
            itemName: '$_id',
            totalCheckedOut: 1,
            _id: 0
          }
        }
      ]) : Promise.resolve([]),

      // Discrepancies
      sellVariationsArray.length > 0 ? StockDiscrepancy.aggregate([
        {
          $match: {
            categoryName: { $in: sellVariationsArray }
          }
        },
        {
          $group: {
            _id: { $toLower: '$categoryName' },
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
            categoryName: '$_id',
            totalDiscrepancies: 1,
            totalDiscrepancyDifference: 1,
            approvedAdjustment: 1,
            _id: 0
          }
        }
      ]) : Promise.resolve([])
    ]);

    const usePurchases = ordersResult[0]?.usePurchases || [];
    const sellPurchases = ordersResult[0]?.sellPurchases || [];
    const sales = invoicesResult;
    const checkouts = checkoutsResult;
    const discrepancies = discrepanciesResult;

    console.timeEnd('[StockSummary] Step 2: Mega query');

    // Step 3: Build result maps
    console.time('[StockSummary] Step 3: Build result maps');

    // Map canonical names helper using Map
    const getCanonical = (name) => {
      const nameLower = name.toLowerCase();
      return aliasToCanonicalMap.get(nameLower) || name;
    };

    // Build USE stock map with Map
    const useStockMap = new Map();

    // Add purchases
    usePurchases.forEach(p => {
      const category = skuToCategoryMap.get(p._id);
      if (category && useAllowedSet.has(category)) {
        if (!useStockMap.has(category)) {
          useStockMap.set(category, {
            categoryName: category,
            totalQuantity: 0,
            itemCount: 0,
            totalValue: 0
          });
        }
        const stock = useStockMap.get(category);
        stock.totalQuantity += p.totalQuantity || 0;
        stock.totalValue += p.totalValue || 0;
        stock.itemCount += p.itemCount || 0;
      }
    });

    // Ensure all forUse items have entry
    forUseItems.forEach(item => {
      if (!useStockMap.has(item.itemName)) {
        useStockMap.set(item.itemName, {
          categoryName: item.itemName,
          totalQuantity: 0,
          itemCount: 0,
          totalValue: 0
        });
      }
    });

    // Build SELL stock map with Map
    const sellStockMap = new Map();

    // Add purchases
    sellPurchases.forEach(p => {
      const category = skuToCategoryMap.get(p._id);
      if (category && sellAllowedSet.has(category)) {
        if (!sellStockMap.has(category)) {
          sellStockMap.set(category, {
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
          });
        }
        const stock = sellStockMap.get(category);
        stock.totalPurchased += p.totalPurchased || 0;
        stock.totalPurchaseValue += p.totalPurchaseValue || 0;
        stock.itemCount += p.itemCount || 0;
      }
    });

    // Add sales
    sales.forEach(s => {
      const canonical = getCanonical(s.itemName);
      if (sellAllowedSet.has(canonical)) {
        if (!sellStockMap.has(canonical)) {
          sellStockMap.set(canonical, {
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
          });
        }
        const stock = sellStockMap.get(canonical);
        stock.totalSold += s.totalSold || 0;
        stock.totalSalesValue += s.totalSalesValue || 0;
        stock.invoiceCount += s.invoiceCount || 0;
      }
    });

    // Add checkouts
    checkouts.forEach(c => {
      const canonical = getCanonical(c.itemName);
      if (sellAllowedSet.has(canonical)) {
        if (!sellStockMap.has(canonical)) {
          sellStockMap.set(canonical, {
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
          });
        }
        const stock = sellStockMap.get(canonical);
        stock.totalCheckedOut += c.totalCheckedOut || 0;
      }
    });

    // Add discrepancies
    discrepancies.forEach(d => {
      const canonical = getCanonical(d.categoryName);
      if (sellAllowedSet.has(canonical)) {
        if (!sellStockMap.has(canonical)) {
          sellStockMap.set(canonical, {
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
          });
        }
        const stock = sellStockMap.get(canonical);
        stock.totalDiscrepancies += d.totalDiscrepancies || 0;
        stock.totalDiscrepancyDifference += d.totalDiscrepancyDifference || 0;
      }
    });

    // Calculate stock remaining for all sell items
    sellStockMap.forEach((item, category) => {
      const discrepancy = discrepancies.find(d => getCanonical(d.categoryName) === category);
      const adjustment = discrepancy ? (discrepancy.approvedAdjustment || 0) : 0;
      item.stockRemaining = item.totalPurchased - item.totalSold - item.totalCheckedOut + adjustment;
    });

    // Ensure all forSell items have entry
    forSellItems.forEach(item => {
      if (!sellStockMap.has(item.itemName)) {
        sellStockMap.set(item.itemName, {
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
        });
      }
    });

    console.timeEnd('[StockSummary] Step 3: Build result maps');

    // Step 4: Sort and calculate totals
    console.time('[StockSummary] Step 4: Sort and totals');

    const useStock = Array.from(useStockMap.values()).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );

    const sellStock = Array.from(sellStockMap.values()).sort((a, b) =>
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

    console.timeEnd('[StockSummary] Step 4: Sort and totals');
    console.timeEnd('[StockSummary] Total time');

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
