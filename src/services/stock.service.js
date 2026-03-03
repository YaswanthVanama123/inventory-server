const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const TruckCheckout = require('../models/TruckCheckout');
const ModelCategory = require('../models/ModelCategory');
const RouteStarItem = require('../models/RouteStarItem');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');

/**
 * Stock Service
 * Business logic for stock operations
 */
class StockService {
  /**
   * Get category SKUs with purchase history
   */
  async getCategorySkus(categoryName) {
    // Get mappings for this category
    const mappings = await ModelCategory.find({
      categoryItemName: categoryName
    }).lean();

    const skus = mappings.map(m => m.modelNumber);

    if (skus.length === 0) {
      return {
        categoryName,
        skus: []
      };
    }

    // Get orders containing these SKUs
    const orders = await CustomerConnectOrder.find({
      status: { $in: ['Complete', 'Processing', 'Shipped'] },
      'items.sku': { $in: skus }
    }).lean();

    // Build SKU data
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

    // Ensure all SKUs have an entry
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

    // Sort by SKU
    const skuArray = Object.values(skuData).sort((a, b) =>
      a.sku.localeCompare(b.sku)
    );

    return {
      categoryName,
      skus: skuArray
    };
  }

  /**
   * Get category sales with purchases, sales, checkouts, and discrepancies
   */
  async getCategorySales(categoryName) {
    // Load alias map
    const aliasMap = await RouteStarItemAlias.buildLookupMap();

    // Find all variations of the category name
    const variations = this._getItemVariations(categoryName, aliasMap);

    console.log(`Finding data for category: ${categoryName}, variations:`, variations);

    // Get mappings
    const mappings = await ModelCategory.find({
      categoryItemName: categoryName
    }).lean();

    const skus = mappings.map(m => m.modelNumber);

    if (skus.length === 0) {
      return {
        categoryName,
        skus: []
      };
    }

    // Extract category keywords for sales matching
    const categoryKeywords = ['WHITE', 'BLACK', 'BLUE', 'RED', 'GREEN', 'YELLOW', 'BROWN', 'GRAY', 'GREY', 'ORANGE', 'PINK', 'PURPLE'];
    const routeStarItemNames = new Set([categoryName]);

    // Fetch all data in parallel
    const [orders, invoices, checkouts, discrepancies] = await Promise.all([
      CustomerConnectOrder.find({
        status: { $in: ['Complete', 'Processing', 'Shipped'] },
        'items.sku': { $in: skus }
      }).lean(),

      RouteStarInvoice.find({
        status: { $in: ['Completed', 'Closed', 'Pending'] },
        'lineItems.name': { $in: variations }
      }).lean(),

      TruckCheckout.find({
        status: 'checked_out',
        $or: [
          { 'itemsTaken.name': { $in: variations } },  // Old structure
          { itemName: { $in: variations } }             // New structure
        ]
      }).lean(),

      StockDiscrepancy.find({
        $or: [
          { categoryName: categoryName },
          { categoryName: { $in: variations } },
          { itemName: { $in: variations } },
          { itemSku: { $in: skus } }  // Match by SKU as well
        ]
      })
        .populate('reportedBy', 'username fullName')
        .populate('resolvedBy', 'username fullName')
        .lean()
    ]);

    // Extract item names from orders
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

    const skuData = {};

    // Process purchases
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

    // Aggregate sales data
    const categorySalesData = {
      totalSold: 0,
      totalSalesValue: 0,
      salesHistory: []
    };

    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const rawItemName = item.name ? item.name.trim() : '';
          const canonicalItemName = this._getCanonicalName(rawItemName, aliasMap);

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

    // Aggregate checkout data
    const categoryCheckoutData = {
      totalCheckedOut: 0,
      checkoutHistory: []
    };

    checkouts.forEach(checkout => {
      // Old structure: itemsTaken array
      if (checkout.itemsTaken && Array.isArray(checkout.itemsTaken)) {
        checkout.itemsTaken.forEach(item => {
          const rawItemName = item.name ? item.name.trim() : '';
          const canonicalItemName = this._getCanonicalName(rawItemName, aliasMap);

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

      // New structure: itemName and quantityTaking fields directly
      if (checkout.itemName && checkout.quantityTaking) {
        const rawItemName = checkout.itemName.trim();
        const canonicalItemName = this._getCanonicalName(rawItemName, aliasMap);

        if (canonicalItemName === categoryName) {
          categoryCheckoutData.totalCheckedOut += checkout.quantityTaking || 0;
          categoryCheckoutData.checkoutHistory.push({
            employeeName: checkout.employeeName,
            truckNumber: checkout.truckNumber,
            checkoutDate: checkout.checkoutDate,
            quantity: checkout.quantityTaking,
            notes: checkout.notes || ''
          });
        }
      }
    });

    // Distribute sales/checkouts evenly across SKUs
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
          checkoutHistory: [],
          discrepancyHistory: []
        };
      }

      skuData[sku].totalSold = categorySalesData.totalSold / skuCount;
      skuData[sku].totalSalesValue = categorySalesData.totalSalesValue / skuCount;
      skuData[sku].salesHistory = [...categorySalesData.salesHistory];

      skuData[sku].totalCheckedOut = categoryCheckoutData.totalCheckedOut / skuCount;
      skuData[sku].checkoutHistory = [...categoryCheckoutData.checkoutHistory];
    });

    // Group discrepancies by category
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

    // Assign discrepancies and calculate stock
    skus.forEach(sku => {
      if (skuData[sku]) {
        const itemNameUpper = skuData[sku].itemName.toUpperCase();
        let matchedCategory = null;

        for (const keyword of categoryKeywords) {
          if (itemNameUpper.includes(keyword)) {
            matchedCategory = keyword;
            break;
          }
        }

        skuData[sku].discrepancyHistory = [];
        let skuDiscrepancyAdjustment = 0;

        if (matchedCategory && discrepanciesByCategory[matchedCategory]) {
          skuData[sku].discrepancyHistory = discrepanciesByCategory[matchedCategory];

          discrepanciesByCategory[matchedCategory].forEach(d => {
            if (d.status === 'Approved' && d.difference !== undefined) {
              skuDiscrepancyAdjustment += d.difference;
            }
          });
        } else if (discrepanciesByCategory[categoryName]) {
          skuData[sku].discrepancyHistory = discrepanciesByCategory[categoryName];

          const categoryDiscrepancyTotal = discrepanciesByCategory[categoryName]
            .filter(d => d.status === 'Approved' && d.difference !== undefined)
            .reduce((sum, d) => sum + d.difference, 0);

          skuDiscrepancyAdjustment = categoryDiscrepancyTotal / skuCount;
        }

        skuData[sku].stockRemaining =
          skuData[sku].totalPurchased -
          skuData[sku].totalSold -
          skuData[sku].totalCheckedOut +
          skuDiscrepancyAdjustment;
      }
    });

    const skuArray = Object.values(skuData).sort((a, b) =>
      a.sku.localeCompare(b.sku)
    );

    return {
      categoryName,
      skus: skuArray
    };
  }

  /**
   * Get forUse stock summary
   */
  async getUseStock() {
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

    // Ensure all forUse items have entry
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

    return {
      items: stockData,
      totals
    };
  }

  /**
   * Get forSell stock summary
   */
  async getSellStock() {
    const forSellItems = await RouteStarItem.find({ forSell: true }).lean();
    const allowedCategories = new Set(forSellItems.map(item => item.itemName));

    const mappings = await ModelCategory.find().lean();
    const skuToCategoryMap = {};

    mappings.forEach(mapping => {
      if (mapping.modelNumber && mapping.categoryItemName) {
        skuToCategoryMap[mapping.modelNumber] = mapping.categoryItemName;
      }
    });

    // Fetch all data in parallel
    const [orders, invoices, checkouts, discrepancies, aliasMap] = await Promise.all([
      CustomerConnectOrder.find({
        status: { $in: ['Complete', 'Processing', 'Shipped'] }
      }).lean(),

      RouteStarInvoice.find({
        status: { $in: ['Completed', 'Closed', 'Pending'] }
      }).lean(),

      TruckCheckout.find({
        status: 'checked_out'
      }).lean(),

      StockDiscrepancy.find({
        categoryName: { $in: Array.from(allowedCategories) }
      })
        .populate('reportedBy', 'username fullName')
        .populate('resolvedBy', 'username fullName')
        .lean(),

      RouteStarItemAlias.buildLookupMap()
    ]);

    const categoryMap = {};
    const categoryInvoices = {};

    // Calculate purchases
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
                totalCheckedOut: 0,
                totalDiscrepancies: 0,
                totalDiscrepancyDifference: 0,
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

    // Calculate sales
    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(item => {
          const rawItemName = item.name ? item.name.trim() : '';
          const itemNameLower = rawItemName.toLowerCase();
          const canonicalName = aliasMap[itemNameLower] || rawItemName;

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
                totalDiscrepancyDifference: 0,
                checkoutDetails: [],
                itemCount: 0,
                invoiceCount: 0,
                stockRemaining: 0
              };
            }

            categoryMap[canonicalName].totalSold += item.quantity || 0;
            categoryMap[canonicalName].totalSalesValue += item.amount || 0;

            if (!categoryInvoices[canonicalName]) {
              categoryInvoices[canonicalName] = new Set();
            }
            categoryInvoices[canonicalName].add(invoice.invoiceNumber);
          }
        });
      }
    });

    // Calculate checkouts (support both old and new structure)
    checkouts.forEach(checkout => {
      // Old structure: itemsTaken array
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
                totalDiscrepancies: 0,
                totalDiscrepancyDifference: 0,
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

      // New structure: itemName and quantityTaking fields directly
      if (checkout.itemName && checkout.quantityTaking) {
        const itemName = checkout.itemName.trim();
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
              totalDiscrepancies: 0,
              totalDiscrepancyDifference: 0,
              checkoutDetails: [],
              itemCount: 0,
              invoiceCount: 0,
              stockRemaining: 0
            };
          }

          categoryMap[canonicalName].totalCheckedOut += checkout.quantityTaking || 0;
          categoryMap[canonicalName].checkoutDetails.push({
            employeeName: checkout.employeeName,
            truckNumber: checkout.truckNumber,
            quantity: checkout.quantityTaking,
            checkoutDate: checkout.checkoutDate
          });
        }
      }
    });

    // Update invoice counts
    Object.keys(categoryInvoices).forEach(categoryName => {
      if (categoryMap[categoryName]) {
        categoryMap[categoryName].invoiceCount = categoryInvoices[categoryName].size;
      }
    });

    // Process discrepancies
    const processedDiscrepancies = new Set();

    discrepancies.forEach(discrepancy => {
      const matchedCategory = discrepancy.categoryName;

      if (!matchedCategory) return;

      const discrepancyKey = `${discrepancy._id}-${matchedCategory}`;
      if (processedDiscrepancies.has(discrepancyKey)) return;

      if (allowedCategories.has(matchedCategory) && categoryMap[matchedCategory]) {
        categoryMap[matchedCategory].totalDiscrepancies += 1;
        categoryMap[matchedCategory].totalDiscrepancyDifference += (discrepancy.difference || 0);
        processedDiscrepancies.add(discrepancyKey);

        if (discrepancy.status === 'Approved' && discrepancy.difference !== undefined) {
          if (!categoryMap[matchedCategory].discrepancyAdjustment) {
            categoryMap[matchedCategory].discrepancyAdjustment = 0;
          }
          categoryMap[matchedCategory].discrepancyAdjustment += discrepancy.difference;
        }
      }
    });

    // Calculate stock remaining
    Object.values(categoryMap).forEach(category => {
      const adjustment = category.discrepancyAdjustment || 0;
      category.stockRemaining = category.totalPurchased - category.totalSold - category.totalCheckedOut + adjustment;
      delete category.discrepancyAdjustment;
    });

    // Ensure all forSell items have entry
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

    const stockData = Object.values(categoryMap).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );

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

    return {
      items: stockData,
      totals
    };
  }

  /**
   * Get complete stock summary (optimized mega aggregation)
   */
  async getStockSummary() {
    console.time('[StockSummary] Total time');

    // Step 1: Get metadata in parallel
    console.time('[StockSummary] Step 1: Metadata');
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

    // Build SKU maps
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

    // Build alias map
    const aliasToCanonicalMap = new Map();
    const sellVariationsSet = new Set();

    sellAllowedSet.forEach(c => {
      sellVariationsSet.add(c);
      sellVariationsSet.add(c.toLowerCase());
    });

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

    console.log(`[StockSummary] Use: ${useAllowedSet.size} cats, ${useSKUs.length} SKUs | Sell: ${sellAllowedSet.size} cats, ${sellSKUs.length} SKUs, ${sellVariationsArray.length} variations`);

    // Step 1.6: Get SKU item names from orders and extract sales keywords dynamically
    console.time('[StockSummary] Step 1.6: Extract sales keywords from purchases');
    const skuToItemNameMap = new Map();
    const salesKeywordsSet = new Set(); // Dynamically extracted keywords from item names

    const skuOrders = await CustomerConnectOrder.find({
      'items.sku': { $in: sellSKUs }
    }).select('items.sku items.name').lean();

    skuOrders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          if (sellSKUs.includes(sku) && item.name) {
            skuToItemNameMap.set(sku, item.name);

            // Extract potential sales keywords from item name
            // Match words in quotes: "WHITE", "BLACK", etc.
            const quotedMatches = item.name.match(/"([^"]+)"/g);
            if (quotedMatches) {
              quotedMatches.forEach(match => {
                const keyword = match.replace(/"/g, '').trim();
                if (keyword) {
                  salesKeywordsSet.add(keyword);
                  salesKeywordsSet.add(keyword.toLowerCase());
                }
              });
            }

            // Also extract uppercase words (likely categories/types)
            const words = item.name.split(/[\s,]+/);
            words.forEach(word => {
              const cleaned = word.replace(/[^A-Za-z0-9]/g, '');
              // Add words that are all uppercase and longer than 2 characters
              if (cleaned && cleaned.length > 2 && cleaned === cleaned.toUpperCase()) {
                salesKeywordsSet.add(cleaned);
                salesKeywordsSet.add(cleaned.toLowerCase());
              }
            });
          }
        });
      }
    });

    // Add extracted keywords to variations array for invoice matching
    salesKeywordsSet.forEach(kw => sellVariationsSet.add(kw));
    const finalSellVariationsArray = Array.from(sellVariationsSet);
    console.timeEnd('[StockSummary] Step 1.6: Extract sales keywords from purchases');

    console.log(`[StockSummary] Extracted ${salesKeywordsSet.size} sales keywords from item names`);

    // Step 2: MEGA AGGREGATION
    console.time('[StockSummary] Step 2: Mega query');

    const [ordersResult, invoicesResult, checkoutsResult, discrepanciesResult] = await Promise.all([
      // Orders
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
      finalSellVariationsArray.length > 0 ? RouteStarInvoice.aggregate([
        {
          $match: {
            status: { $in: ['Completed', 'Closed', 'Pending'] },
            'lineItems.0': { $exists: true },
            'lineItems.name': { $in: finalSellVariationsArray }
          }
        },
        { $unwind: '$lineItems' },
        {
          $match: {
            'lineItems.name': { $in: finalSellVariationsArray }
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

      // Checkouts (support both old and new structure)
      finalSellVariationsArray.length > 0 ? TruckCheckout.aggregate([
        {
          $match: {
            status: 'checked_out',
            $or: [
              { 'itemsTaken.0': { $exists: true } }, // Old structure
              { 'itemName': { $exists: true } } // New structure
            ]
          }
        },
        {
          $facet: {
            // Old structure: itemsTaken array
            oldStructure: [
              { $match: { 'itemsTaken.0': { $exists: true } } },
              { $unwind: '$itemsTaken' },
              {
                $match: {
                  'itemsTaken.name': { $in: finalSellVariationsArray }
                }
              },
              {
                $group: {
                  _id: { $toLower: '$itemsTaken.name' },
                  totalCheckedOut: { $sum: '$itemsTaken.quantity' }
                }
              }
            ],
            // New structure: itemName field directly
            newStructure: [
              { $match: { 'itemName': { $exists: true, $in: finalSellVariationsArray } } },
              {
                $group: {
                  _id: { $toLower: '$itemName' },
                  totalCheckedOut: { $sum: '$quantityTaking' }
                }
              }
            ]
          }
        },
        {
          $project: {
            combined: { $concatArrays: ['$oldStructure', '$newStructure'] }
          }
        },
        { $unwind: '$combined' },
        { $replaceRoot: { newRoot: '$combined' } },
        {
          $group: {
            _id: '$_id',
            totalCheckedOut: { $sum: '$totalCheckedOut' }
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

      // Discrepancies (fetch raw documents to process with SKU mapping)
      (finalSellVariationsArray.length > 0 || sellSKUs.length > 0) ? StockDiscrepancy.find({
        $or: [
          { categoryName: { $in: finalSellVariationsArray } },
          { itemName: { $in: finalSellVariationsArray } },
          { itemSku: { $in: sellSKUs } }
        ]
      }).lean() : Promise.resolve([])
    ]);

    const usePurchases = ordersResult[0]?.usePurchases || [];
    const sellPurchases = ordersResult[0]?.sellPurchases || [];
    const sales = invoicesResult;
    const checkouts = checkoutsResult;
    const rawDiscrepancies = discrepanciesResult;

    // Helper function to get canonical category name from alias
    const getCanonical = (name) => {
      const nameLower = name.toLowerCase();
      return aliasToCanonicalMap.get(nameLower) || name;
    };

    // Process raw discrepancies and group by target category
    const discrepancyMap = new Map();
    rawDiscrepancies.forEach(disc => {
      let targetCategory = null;

      // First, try to map by SKU if available
      if (disc.itemSku && skuToCategoryMap.has(disc.itemSku)) {
        targetCategory = skuToCategoryMap.get(disc.itemSku);
      }

      // If no SKU match, try categoryName
      if (!targetCategory || !sellAllowedSet.has(targetCategory)) {
        targetCategory = getCanonical(disc.categoryName || '');
      }

      // If still no match, try itemName
      if (!targetCategory || !sellAllowedSet.has(targetCategory)) {
        targetCategory = getCanonical(disc.itemName || '');
      }

      // Only process if we found a valid target category
      if (targetCategory && sellAllowedSet.has(targetCategory)) {
        if (!discrepancyMap.has(targetCategory)) {
          discrepancyMap.set(targetCategory, {
            totalDiscrepancies: 0,
            totalDiscrepancyDifference: 0,
            approvedAdjustment: 0
          });
        }
        const aggData = discrepancyMap.get(targetCategory);
        aggData.totalDiscrepancies += 1;
        aggData.totalDiscrepancyDifference += disc.difference || 0;
        if (disc.status === 'Approved') {
          aggData.approvedAdjustment += disc.difference || 0;
        }
      }
    });

    // Convert map to array format expected by downstream code
    const discrepancies = Array.from(discrepancyMap.entries()).map(([categoryName, data]) => ({
      categoryName,
      ...data
    }));

    console.timeEnd('[StockSummary] Step 2: Mega query');

    // Step 3: Build result maps
    console.time('[StockSummary] Step 3: Build result maps');

    // Build case-insensitive category lookup map
    const lowercaseToCategoryMap = new Map();
    sellAllowedSet.forEach(category => {
      lowercaseToCategoryMap.set(category.toLowerCase(), category);
    });

    // Build keyword-to-category mapping for sales distribution
    // Map each extracted keyword to categories that have items with that keyword
    const keywordToCategoriesMap = new Map();
    const extractedKeywords = Array.from(salesKeywordsSet);

    // Build mapping: WHITE -> [Bulk Soap, ...], BLACK -> [Other Category, ...]
    for (const [sku, itemName] of skuToItemNameMap.entries()) {
      const category = skuToCategoryMap.get(sku);
      if (category && sellAllowedSet.has(category)) {
        const itemNameUpper = itemName.toUpperCase();

        // Check against all extracted keywords
        extractedKeywords.forEach(keyword => {
          const keywordUpper = keyword.toUpperCase();
          if (itemNameUpper.includes(keywordUpper)) {
            if (!keywordToCategoriesMap.has(keywordUpper)) {
              keywordToCategoriesMap.set(keywordUpper, new Set());
            }
            keywordToCategoriesMap.get(keywordUpper).add(category);
          }
        });
      }
    }

    // Process sales: map keyword sales to target categories
    const salesByCategory = new Map();
    sales.forEach(s => {
      // s.itemName comes from aggregation as lowercase
      const itemNameLower = s.itemName.toLowerCase();

      // First try direct category match (case-insensitive)
      let targetCategory = lowercaseToCategoryMap.get(itemNameLower);

      // If not found, try alias resolution
      if (!targetCategory) {
        targetCategory = getCanonical(s.itemName);
        // getCanonical might return the original casing, so check again
        if (!sellAllowedSet.has(targetCategory)) {
          targetCategory = lowercaseToCategoryMap.get(targetCategory.toLowerCase());
        }
      }

      // If not a valid category, check if it's an extracted keyword
      if (!targetCategory || !sellAllowedSet.has(targetCategory)) {
        const itemNameUpper = s.itemName.toUpperCase();

        if (keywordToCategoriesMap.has(itemNameUpper)) {
          // Distribute this keyword sale across all relevant categories
          const relevantCategories = Array.from(keywordToCategoriesMap.get(itemNameUpper));

          relevantCategories.forEach(cat => {
            if (!salesByCategory.has(cat)) {
              salesByCategory.set(cat, {
                totalSold: 0,
                totalSalesValue: 0,
                invoiceCount: 0
              });
            }
            const categoryData = salesByCategory.get(cat);
            categoryData.totalSold += s.totalSold || 0;
            categoryData.totalSalesValue += s.totalSalesValue || 0;
            categoryData.invoiceCount += s.invoiceCount || 0;
          });
          return; // Handled as keyword
        }
      }

      // Regular category sale
      if (targetCategory && sellAllowedSet.has(targetCategory)) {
        if (!salesByCategory.has(targetCategory)) {
          salesByCategory.set(targetCategory, {
            totalSold: 0,
            totalSalesValue: 0,
            invoiceCount: 0
          });
        }
        const categoryData = salesByCategory.get(targetCategory);
        categoryData.totalSold += s.totalSold || 0;
        categoryData.totalSalesValue += s.totalSalesValue || 0;
        categoryData.invoiceCount += s.invoiceCount || 0;
      }
    });

    // Build USE stock map
    const useStockMap = new Map();

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

    // Build SELL stock map
    const sellStockMap = new Map();

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

    // Add sales from processed salesByCategory map
    salesByCategory.forEach((saleData, category) => {
      if (sellAllowedSet.has(category)) {
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
        stock.totalSold += saleData.totalSold || 0;
        stock.totalSalesValue += saleData.totalSalesValue || 0;
        stock.invoiceCount += saleData.invoiceCount || 0;
      }
    });

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

    discrepancies.forEach(d => {
      const canonical = d.categoryName; // Already mapped to target category in processing above

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

    // Calculate stock remaining
    sellStockMap.forEach((item, category) => {
      const discrepancy = discrepancies.find(d => d.categoryName === category);
      const adjustment = discrepancy ? (discrepancy.approvedAdjustment || 0) : 0;
      item.stockRemaining = item.totalPurchased - item.totalSold - item.totalCheckedOut + adjustment;
    });

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

  /**
   * Helper: Get item variations (aliases)
   * @private
   */
  _getItemVariations(canonicalName, aliasMap) {
    const variations = [canonicalName, canonicalName.toLowerCase()];

    Object.keys(aliasMap).forEach(alias => {
      if (aliasMap[alias] === canonicalName) {
        variations.push(alias);
      }
    });

    return variations;
  }

  /**
   * Helper: Get canonical name for item
   * @private
   */
  _getCanonicalName(itemName, aliasMap) {
    return aliasMap[itemName.toLowerCase()] || itemName;
  }
}

module.exports = new StockService();
