const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const TruckCheckout = require('../models/TruckCheckout');
const ModelCategory = require('../models/ModelCategory');
const RouteStarItem = require('../models/RouteStarItem');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');


class StockService {
  constructor() {
    this._cache = new Map();
    this._cacheTTL = new Map();
  }
  _cacheGet(key) {
    const ttl = this._cacheTTL.get(key);
    if (ttl && Date.now() > ttl) {
      this._cache.delete(key);
      this._cacheTTL.delete(key);
      return null;
    }
    return this._cache.get(key);
  }
  _cacheSet(key, value, ttlSeconds) {
    this._cache.set(key, value);
    this._cacheTTL.set(key, Date.now() + (ttlSeconds * 1000));
  }
  async getCategorySkus(categoryName) {
    console.time(`[getCategorySkus] Total for ${categoryName}`);
    console.time('[getCategorySkus] Step 1: Get mappings');
    const mappings = await ModelCategory.find({
      categoryItemName: categoryName
    }).lean();
    console.timeEnd('[getCategorySkus] Step 1: Get mappings');
    const skus = mappings.map(m => m.modelNumber);
    if (skus.length === 0) {
      console.timeEnd(`[getCategorySkus] Total for ${categoryName}`);
      return {
        categoryName,
        skus: []
      };
    }
    console.log(`[getCategorySkus] Found ${skus.length} SKUs for ${categoryName}`);
    console.time('[getCategorySkus] Step 2: Aggregate SKU data');
    const skuAggregation = await CustomerConnectOrder.aggregate([
      {
        $match: {
          status: { $in: ['Complete', 'Processing', 'Shipped'] },
          verified: true,
          'items.sku': { $in: skus }
        }
      },
      { $unwind: '$items' },
      {
        $match: {
          'items.sku': { $in: skus }
        }
      },
      {
        $group: {
          _id: { $toUpper: '$items.sku' },
          itemName: { $first: '$items.name' },
          totalQuantity: { $sum: '$items.qty' },
          totalValue: { $sum: '$items.lineTotal' },
          purchaseHistory: {
            $push: {
              orderNumber: '$orderNumber',
              orderDate: '$orderDate',
              quantity: '$items.qty',
              unitPrice: '$items.unitPrice',
              lineTotal: '$items.lineTotal',
              vendor: '$vendor.name',
              status: '$status'
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          sku: '$_id',
          itemName: 1,
          totalQuantity: 1,
          totalValue: 1,
          purchaseHistory: 1
        }
      },
      { $sort: { sku: 1 } }
    ]);
    console.timeEnd('[getCategorySkus] Step 2: Aggregate SKU data');
    const skuData = {};
    skuAggregation.forEach(item => {
      skuData[item.sku] = item;
    });
    skus.forEach(sku => {
      const skuUpper = sku.toUpperCase();
      if (!skuData[skuUpper]) {
        const mapping = mappings.find(m => m.modelNumber === sku);
        skuData[skuUpper] = {
          sku: skuUpper,
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
    console.timeEnd(`[getCategorySkus] Total for ${categoryName}`);
    return {
      categoryName,
      skus: skuArray
    };
  }
  async getCategorySales(categoryName) {
    console.time(`[getCategorySales] Total for ${categoryName}`);
    console.time('[getCategorySales] Step 1: Load aliases');

    // Fetch alias mappings to get original case-sensitive names
    const aliasMappings = await RouteStarItemAlias.find({ isActive: true })
      .select('canonicalName aliases')
      .lean();

    // Build variations including all case-sensitive alias names
    const variations = [categoryName, categoryName.toLowerCase(), categoryName.toUpperCase()];

    // Find the mapping that contains this category as canonical OR as an alias
    for (const mapping of aliasMappings) {
      const canonicalLower = mapping.canonicalName.toLowerCase();
      const categoryLower = categoryName.toLowerCase();

      // Check if this category IS the canonical name
      if (canonicalLower === categoryLower) {
        // Add canonical name variations
        variations.push(mapping.canonicalName);

        // Add all aliases with their original case
        if (mapping.aliases && Array.isArray(mapping.aliases)) {
          mapping.aliases.forEach(alias => {
            if (alias && alias.name) {
              variations.push(alias.name);
              variations.push(alias.name.toLowerCase());
              variations.push(alias.name.toUpperCase());
            }
          });
        }
        break;
      }

      // Check if this category is an alias of this canonical name
      if (mapping.aliases && Array.isArray(mapping.aliases)) {
        const isAlias = mapping.aliases.some(alias =>
          alias && alias.name && alias.name.toLowerCase() === categoryLower
        );

        if (isAlias) {
          // Add canonical name variations
          variations.push(mapping.canonicalName);
          variations.push(mapping.canonicalName.toLowerCase());
          variations.push(mapping.canonicalName.toUpperCase());

          // Add all aliases
          mapping.aliases.forEach(alias => {
            if (alias && alias.name) {
              variations.push(alias.name);
              variations.push(alias.name.toLowerCase());
              variations.push(alias.name.toUpperCase());
            }
          });
          break;
        }
      }
    }

    // Remove duplicates
    const uniqueVariations = [...new Set(variations)];

    console.timeEnd('[getCategorySales] Step 1: Load aliases');
    console.log(`Finding data for category: ${categoryName}, variations:`, uniqueVariations);
    console.time('[getCategorySales] Step 2: Get mappings');

    // Find SKUs mapped to this category OR any of its aliases
    const mappings = await ModelCategory.find({
      categoryItemName: { $in: uniqueVariations }
    }).lean();

    console.timeEnd('[getCategorySales] Step 2: Get mappings');
    const skus = mappings.map(m => m.modelNumber);
    if (skus.length === 0) {
      console.timeEnd(`[getCategorySales] Total for ${categoryName}`);
      return {
        categoryName,
        skus: []
      };
    }
    console.log(`[getCategorySales] Found ${skus.length} SKUs`);
    console.time('[getCategorySales] Step 3: Parallel aggregations');
    const [ccPurchaseData, manualPurchaseData, salesData, checkoutData, discrepancies] = await Promise.all([
      // CustomerConnect purchases
      CustomerConnectOrder.aggregate([
        {
          $match: {
            status: { $in: ['Complete', 'Processing', 'Shipped'] },
            verified: true,
            'items.sku': { $in: skus }
          }
        },
        { $unwind: '$items' },
        {
          $match: {
            'items.sku': { $in: skus }
          }
        },
        {
          $group: {
            _id: { $toUpper: '$items.sku' },
            itemName: { $first: '$items.name' },
            totalPurchased: { $sum: '$items.qty' },
            totalPurchaseValue: { $sum: '$items.lineTotal' },
            purchaseHistory: {
              $push: {
                orderNumber: '$orderNumber',
                orderDate: '$orderDate',
                quantity: '$items.qty',
                unitPrice: '$items.unitPrice',
                lineTotal: '$items.lineTotal',
                vendor: '$vendor.name',
                status: '$status',
                source: 'customerconnect'
              }
            }
          }
        }
      ]),
      // Manual purchases
      PurchaseOrder.aggregate([
        {
          $match: {
            source: 'manual',
            status: { $in: ['confirmed', 'received', 'completed'] },
            verified: true,
            'items.sku': { $in: skus }
          }
        },
        { $unwind: '$items' },
        {
          $match: {
            'items.sku': { $in: skus }
          }
        },
        {
          $group: {
            _id: { $toUpper: '$items.sku' },
            itemName: { $first: '$items.name' },
            totalPurchased: { $sum: '$items.qty' },
            totalPurchaseValue: { $sum: '$items.lineTotal' },
            purchaseHistory: {
              $push: {
                orderNumber: '$orderNumber',
                orderDate: '$orderDate',
                quantity: '$items.qty',
                unitPrice: '$items.unitPrice',
                lineTotal: '$items.lineTotal',
                vendor: '$vendor.name',
                status: '$status',
                source: 'manual'
              }
            }
          }
        }
      ]),
      RouteStarInvoice.aggregate([
        {
          $match: {
            status: { $in: ['Completed', 'Closed', 'Pending'] },
            'lineItems.name': { $in: uniqueVariations }
          }
        },
        { $unwind: '$lineItems' },
        {
          $match: {
            'lineItems.name': { $in: uniqueVariations }
          }
        },
        {
          $group: {
            _id: null,
            totalSold: { $sum: '$lineItems.quantity' },
            totalSalesValue: { $sum: '$lineItems.amount' },
            salesHistory: {
              $push: {
                invoiceNumber: '$invoiceNumber',
                invoiceDate: '$invoiceDate',
                quantity: '$lineItems.quantity',
                rate: '$lineItems.rate',
                amount: '$lineItems.amount',
                customer: '$customer.name',
                status: '$status'
              }
            }
          }
        }
      ]),
      TruckCheckout.aggregate([
        {
          $match: {
            status: 'checked_out',
            $or: [
              { 'itemsTaken.name': { $in: uniqueVariations } },
              { itemName: { $in: uniqueVariations } }
            ]
          }
        },
        {
          $facet: {
            oldStructure: [
              { $match: { 'itemsTaken.0': { $exists: true } } },
              { $unwind: '$itemsTaken' },
              { $match: { 'itemsTaken.name': { $in: uniqueVariations } } },
              {
                $group: {
                  _id: null,
                  totalCheckedOut: { $sum: '$itemsTaken.quantity' },
                  checkoutHistory: {
                    $push: {
                      employeeName: '$employeeName',
                      truckNumber: '$truckNumber',
                      checkoutDate: '$checkoutDate',
                      quantity: '$itemsTaken.quantity',
                      notes: '$itemsTaken.notes'
                    }
                  }
                }
              }
            ],
            newStructure: [
              { $match: { itemName: { $in: uniqueVariations } } },
              {
                $group: {
                  _id: null,
                  totalCheckedOut: { $sum: '$quantityTaking' },
                  checkoutHistory: {
                    $push: {
                      employeeName: '$employeeName',
                      truckNumber: '$truckNumber',
                      checkoutDate: '$checkoutDate',
                      quantity: '$quantityTaking',
                      notes: '$notes'
                    }
                  }
                }
              }
            ]
          }
        }
      ]),
      StockDiscrepancy.find({
        $or: [
          { categoryName: categoryName },
          { categoryName: { $in: uniqueVariations } },
          { itemName: { $in: uniqueVariations } },
          { itemSku: { $in: skus } }
        ]
      })
        .populate('reportedBy', 'username fullName')
        .populate('resolvedBy', 'username fullName')
        .lean()
    ]);
    console.timeEnd('[getCategorySales] Step 3: Parallel aggregations');

    // Combine purchase data from both sources
    const purchaseDataMap = new Map();

    // Add CustomerConnect purchases
    ccPurchaseData.forEach(item => {
      purchaseDataMap.set(item._id, {
        sku: item._id,
        itemName: item.itemName || '',
        totalPurchased: item.totalPurchased || 0,
        totalPurchaseValue: item.totalPurchaseValue || 0,
        purchaseHistory: item.purchaseHistory || []
      });
    });

    // Add or merge Manual purchases
    manualPurchaseData.forEach(item => {
      if (purchaseDataMap.has(item._id)) {
        // Merge with existing
        const existing = purchaseDataMap.get(item._id);
        existing.totalPurchased += item.totalPurchased || 0;
        existing.totalPurchaseValue += item.totalPurchaseValue || 0;
        existing.purchaseHistory.push(...(item.purchaseHistory || []));
      } else {
        // Add new entry
        purchaseDataMap.set(item._id, {
          sku: item._id,
          itemName: item.itemName || '',
          totalPurchased: item.totalPurchased || 0,
          totalPurchaseValue: item.totalPurchaseValue || 0,
          purchaseHistory: item.purchaseHistory || []
        });
      }
    });

    // Convert Map to object for SKU data
    const skuData = {};
    purchaseDataMap.forEach((data, sku) => {
      skuData[sku] = {
        ...data,
        totalSold: 0,
        totalSalesValue: 0,
        totalCheckedOut: 0,
        salesHistory: [],
        checkoutHistory: [],
        discrepancyHistory: []
      };
    });
    const categorySalesData = salesData[0] || {
      totalSold: 0,
      totalSalesValue: 0,
      salesHistory: []
    };
    const checkoutResults = checkoutData[0];
    const oldCheckoutData = checkoutResults?.oldStructure?.[0] || { totalCheckedOut: 0, checkoutHistory: [] };
    const newCheckoutData = checkoutResults?.newStructure?.[0] || { totalCheckedOut: 0, checkoutHistory: [] };
    const categoryCheckoutData = {
      totalCheckedOut: oldCheckoutData.totalCheckedOut + newCheckoutData.totalCheckedOut,
      checkoutHistory: [...oldCheckoutData.checkoutHistory, ...newCheckoutData.checkoutHistory]
    };

    // Calculate total purchases to distribute sales proportionally
    const totalPurchased = Array.from(purchaseDataMap.values()).reduce((sum, item) => sum + (item.totalPurchased || 0), 0);

    const skuCount = skus.length || 1;
    skus.forEach(sku => {
      const skuUpper = sku.toUpperCase();
      if (!skuData[skuUpper]) {
        const mapping = mappings.find(m => m.modelNumber === sku);
        skuData[skuUpper] = {
          sku: skuUpper,
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

      skuData[skuUpper].salesHistory = categorySalesData.salesHistory || [];
      skuData[skuUpper].checkoutHistory = categoryCheckoutData.checkoutHistory || [];
      skuData[skuUpper].discrepancyHistory = discrepancies.filter(d =>
        d.itemSku === sku
      );
    });

    // Distribute sales using remainder distribution to avoid rounding errors
    const salesDistribution = [];
    skus.forEach(sku => {
      const skuUpper = sku.toUpperCase();
      const purchaseRatio = totalPurchased > 0 ? (skuData[skuUpper].totalPurchased || 0) / totalPurchased : (1 / skuCount);
      const exactValue = categorySalesData.totalSold * purchaseRatio;
      const floorValue = Math.floor(exactValue);
      const fractionalPart = exactValue - floorValue;
      salesDistribution.push({ sku: skuUpper, floorValue, fractionalPart, purchaseRatio });
    });

    // Sort by fractional part descending to distribute remainder
    salesDistribution.sort((a, b) => b.fractionalPart - a.fractionalPart);
    const totalSalesFloored = salesDistribution.reduce((sum, item) => sum + item.floorValue, 0);
    const salesRemainder = categorySalesData.totalSold - totalSalesFloored;

    // Distribute the remainder to SKUs with largest fractional parts
    salesDistribution.forEach((item, index) => {
      skuData[item.sku].totalSold = item.floorValue + (index < salesRemainder ? 1 : 0);
      skuData[item.sku].totalSalesValue = categorySalesData.totalSalesValue * item.purchaseRatio;
    });

    // Distribute checkouts using remainder distribution to avoid rounding errors
    const checkoutDistribution = [];
    skus.forEach(sku => {
      const skuUpper = sku.toUpperCase();
      const purchaseRatio = totalPurchased > 0 ? (skuData[skuUpper].totalPurchased || 0) / totalPurchased : (1 / skuCount);
      const exactValue = categoryCheckoutData.totalCheckedOut * purchaseRatio;
      const floorValue = Math.floor(exactValue);
      const fractionalPart = exactValue - floorValue;
      checkoutDistribution.push({ sku: skuUpper, floorValue, fractionalPart });
    });

    // Sort by fractional part descending to distribute remainder
    checkoutDistribution.sort((a, b) => b.fractionalPart - a.fractionalPart);
    const totalCheckoutsFloored = checkoutDistribution.reduce((sum, item) => sum + item.floorValue, 0);
    const checkoutRemainder = categoryCheckoutData.totalCheckedOut - totalCheckoutsFloored;

    // Distribute the remainder to SKUs with largest fractional parts
    checkoutDistribution.forEach((item, index) => {
      skuData[item.sku].totalCheckedOut = item.floorValue + (index < checkoutRemainder ? 1 : 0);
    });
    const skuArray = Object.values(skuData).sort((a, b) =>
      a.sku.localeCompare(b.sku)
    );
    console.timeEnd(`[getCategorySales] Total for ${categoryName}`);
    return {
      categoryName,
      skus: skuArray,
      summary: {
        totalPurchased: skuArray.reduce((sum, s) => sum + s.totalPurchased, 0),
        totalPurchaseValue: skuArray.reduce((sum, s) => sum + s.totalPurchaseValue, 0),
        totalSold: categorySalesData.totalSold,
        totalSalesValue: categorySalesData.totalSalesValue,
        totalCheckedOut: categoryCheckoutData.totalCheckedOut,
        totalDiscrepancies: discrepancies.length,
        stockRemaining: skuArray.reduce((sum, s) => sum + s.totalPurchased, 0) - categorySalesData.totalSold - categoryCheckoutData.totalCheckedOut
      }
    };
  }
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
      status: { $in: ['Complete', 'Processing', 'Shipped'] },
      verified: true
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
    return {
      items: stockData,
      totals
    };
  }
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
    const Settings = require('../models/Settings');
    const settings = await Settings.getSettings();
    const cutoffDate = settings.stockCalculationCutoffDate;
    console.log(`[getSellStock] Cutoff Date: ${cutoffDate ? cutoffDate.toISOString().split('T')[0] : 'Not Set'}`);
    const [orders, invoices, checkouts, discrepancies, aliasMap, aliasMappings] = await Promise.all([
      CustomerConnectOrder.find({
        status: { $in: ['Complete', 'Processing', 'Shipped'] },
        verified: true
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
      RouteStarItemAlias.buildLookupMap(),
      RouteStarItemAlias.find({ isActive: true }).select('canonicalName aliases').lean()
    ]);

    // Build a set of all canonical names for allowed categories
    const canonicalNames = new Set();
    aliasMappings.forEach(mapping => {
      // Check if any alias of this canonical name is in allowedCategories
      const hasAllowedAlias = mapping.aliases.some(alias =>
        allowedCategories.has(alias.name)
      );
      if (hasAllowedAlias) {
        canonicalNames.add(mapping.canonicalName);
      }
    });

    // Create an expanded allowed set that includes both aliases and canonical names
    const expandedAllowedCategories = new Set([...allowedCategories, ...canonicalNames]);

    const categoryMap = {};
    const categoryInvoices = {};
    console.log(`[getSellStock] Processing orders. AllowedCategories size: ${allowedCategories.size}, ExpandedAllowedCategories size: ${expandedAllowedCategories.size}`);
    console.log(`[getSellStock] CanonicalNames:`, Array.from(canonicalNames));

    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.sku ? item.sku.toUpperCase() : '';
          const originalCategory = skuToCategoryMap[sku];

          // Skip if no mapping
          if (!originalCategory) {
            return;
          }

          // Convert to canonical name if mapped
          const categoryLower = originalCategory.toLowerCase();
          const category = aliasMap[categoryLower] || originalCategory;

          // Check if either the original OR canonical name is in our allowed sets
          const isAllowed = allowedCategories.has(originalCategory) || expandedAllowedCategories.has(category);

          if (!isAllowed) {
            console.log(`[getSellStock] Skipping SKU ${sku}: originalCategory="${originalCategory}", category="${category}", isAllowed=false`);
            return;
          }

          console.log(`[getSellStock] Aggregating SKU ${sku} qty=${item.qty} under category="${category}" (original="${originalCategory}")`);

          if (!categoryMap[category]) {
            categoryMap[category] = {
              categoryName: category,
              totalPurchased: 0,
              totalPurchaseValue: 0,
              totalSold: 0,
              totalSoldBeforeCutoff: 0,
              totalSalesValue: 0,
              totalCheckedOut: 0,
              totalCheckedOutAfterCutoff: 0,
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
        });
      }
    });
    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        const invoiceDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : null;
        const isBeforeCutoff = !cutoffDate || !invoiceDate || invoiceDate < cutoffDate;
        invoice.lineItems.forEach(item => {
          const rawItemName = item.name ? item.name.trim() : '';

          // Check if original item name is in allowedCategories
          if (!allowedCategories.has(rawItemName)) {
            return;
          }

          // Convert to canonical name
          const itemNameLower = rawItemName.toLowerCase();
          const canonicalName = aliasMap[itemNameLower] || rawItemName;

          if (!categoryMap[canonicalName]) {
            categoryMap[canonicalName] = {
              categoryName: canonicalName,
              totalPurchased: 0,
              totalPurchaseValue: 0,
              totalSold: 0,
              totalSoldBeforeCutoff: 0,
              totalSalesValue: 0,
              totalCheckedOut: 0,
              totalCheckedOutAfterCutoff: 0,
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
          if (isBeforeCutoff) {
            categoryMap[canonicalName].totalSoldBeforeCutoff += item.quantity || 0;
          }
          if (!categoryInvoices[canonicalName]) {
            categoryInvoices[canonicalName] = new Set();
          }
          categoryInvoices[canonicalName].add(invoice.invoiceNumber);
        });
      }
    });
    checkouts.forEach(checkout => {
      const checkoutDate = checkout.checkoutDate ? new Date(checkout.checkoutDate) : null;
      const isAfterCutoff = cutoffDate && checkoutDate && checkoutDate >= cutoffDate;
      if (checkout.itemsTaken && Array.isArray(checkout.itemsTaken)) {
        checkout.itemsTaken.forEach(item => {
          const itemName = item.name ? item.name.trim() : '';

          // Check if original item name is in allowedCategories
          if (!allowedCategories.has(itemName)) {
            return;
          }

          // Convert to canonical name
          const itemNameLower = itemName.toLowerCase();
          const canonicalName = aliasMap[itemNameLower] || itemName;

          if (!categoryMap[canonicalName]) {
            categoryMap[canonicalName] = {
              categoryName: canonicalName,
              totalPurchased: 0,
              totalPurchaseValue: 0,
              totalSold: 0,
              totalSoldBeforeCutoff: 0,
              totalSalesValue: 0,
              totalCheckedOut: 0,
              totalCheckedOutAfterCutoff: 0,
              totalDiscrepancies: 0,
              totalDiscrepancyDifference: 0,
              checkoutDetails: [],
              itemCount: 0,
              invoiceCount: 0,
              stockRemaining: 0
            };
          }
          categoryMap[canonicalName].totalCheckedOut += item.quantity || 0;
          if (isAfterCutoff) {
            categoryMap[canonicalName].totalCheckedOutAfterCutoff += item.quantity || 0;
          }
          categoryMap[canonicalName].checkoutDetails.push({
            employeeName: checkout.employeeName,
            truckNumber: checkout.truckNumber,
            quantity: item.quantity,
            checkoutDate: checkout.checkoutDate
          });
        });
      }
      if (checkout.itemName && checkout.quantityTaking) {
        const itemName = checkout.itemName.trim();

        // Check if original item name is in allowedCategories
        if (!allowedCategories.has(itemName)) {
          return;
        }

        // Convert to canonical name
        const itemNameLower = itemName.toLowerCase();
        const canonicalName = aliasMap[itemNameLower] || itemName;

        if (!categoryMap[canonicalName]) {
          categoryMap[canonicalName] = {
            categoryName: canonicalName,
            totalPurchased: 0,
            totalPurchaseValue: 0,
            totalSold: 0,
            totalSoldBeforeCutoff: 0,
            totalSalesValue: 0,
            totalCheckedOut: 0,
            totalCheckedOutAfterCutoff: 0,
            totalDiscrepancies: 0,
            totalDiscrepancyDifference: 0,
            checkoutDetails: [],
            itemCount: 0,
            invoiceCount: 0,
            stockRemaining: 0
          };
        }
        categoryMap[canonicalName].totalCheckedOut += checkout.quantityTaking || 0;
        if (isAfterCutoff) {
          categoryMap[canonicalName].totalCheckedOutAfterCutoff += checkout.quantityTaking || 0;
        }
        categoryMap[canonicalName].checkoutDetails.push({
          employeeName: checkout.employeeName,
          truckNumber: checkout.truckNumber,
          quantity: checkout.quantityTaking,
          checkoutDate: checkout.checkoutDate
        });
      }
    });
    Object.keys(categoryInvoices).forEach(categoryName => {
      if (categoryMap[categoryName]) {
        categoryMap[categoryName].invoiceCount = categoryInvoices[categoryName].size;
      }
    });
    const processedDiscrepancies = new Set();
    discrepancies.forEach(discrepancy => {
      const rawCategory = discrepancy.categoryName;
      if (!rawCategory) return;

      // Convert to canonical name
      const categoryLower = rawCategory.toLowerCase();
      const matchedCategory = aliasMap[categoryLower] || rawCategory;

      // Check if EITHER the raw category OR canonical name is in allowedCategories
      const isAllowed = allowedCategories.has(rawCategory) ||
                        allowedCategories.has(matchedCategory) ||
                        expandedAllowedCategories.has(matchedCategory);

      if (!isAllowed) return;

      const discrepancyKey = `${discrepancy._id}-${matchedCategory}`;
      if (processedDiscrepancies.has(discrepancyKey)) return;

      if (categoryMap[matchedCategory]) {
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
    Object.values(categoryMap).forEach(category => {
      const adjustment = category.discrepancyAdjustment || 0;
      category.stockRemaining = category.totalPurchased
                              - category.totalSoldBeforeCutoff
                              - category.totalCheckedOutAfterCutoff
                              + adjustment;
      delete category.discrepancyAdjustment;
      console.log(`[getSellStock] ${category.categoryName}: Purchased=${category.totalPurchased}, SoldBeforeCutoff=${category.totalSoldBeforeCutoff}, CheckoutAfterCutoff=${category.totalCheckedOutAfterCutoff}, Adjustment=${adjustment}, Remaining=${category.stockRemaining}`);
    });
    // Add canonical names that don't have any data yet
    canonicalNames.forEach(canonicalName => {
      if (!categoryMap[canonicalName]) {
        categoryMap[canonicalName] = {
          categoryName: canonicalName,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          checkoutDetails: [],
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        };
      }
    });

    // Also add any unmapped items from forSellItems
    forSellItems.forEach(item => {
      const itemName = item.itemName;
      const itemNameLower = itemName.toLowerCase();
      const canonicalName = aliasMap[itemNameLower] || itemName;

      if (!categoryMap[canonicalName]) {
        categoryMap[canonicalName] = {
          categoryName: canonicalName,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          checkoutDetails: [],
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        };
      }
    });

    // CONSOLIDATION: Merge all items by their canonical names
    const consolidatedMap = new Map();
    Object.values(categoryMap).forEach(item => {
      const itemNameLower = item.categoryName.toLowerCase();
      const canonical = aliasMap[itemNameLower] || item.categoryName;

      if (!consolidatedMap.has(canonical)) {
        consolidatedMap.set(canonical, {
          categoryName: canonical,
          aliases: [],
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          checkoutDetails: [],
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        });
      }

      const target = consolidatedMap.get(canonical);

      // Track aliases that were merged into this canonical name
      if (item.categoryName !== canonical && !target.aliases.includes(item.categoryName)) {
        target.aliases.push(item.categoryName);
      }

      target.totalPurchased += item.totalPurchased || 0;
      target.totalPurchaseValue += item.totalPurchaseValue || 0;
      target.totalSold += item.totalSold || 0;
      target.totalSoldBeforeCutoff += item.totalSoldBeforeCutoff || 0;
      target.totalSalesValue += item.totalSalesValue || 0;
      target.totalCheckedOut += item.totalCheckedOut || 0;
      target.totalCheckedOutAfterCutoff += item.totalCheckedOutAfterCutoff || 0;
      target.totalDiscrepancies += item.totalDiscrepancies || 0;
      target.totalDiscrepancyDifference += item.totalDiscrepancyDifference || 0;
      target.itemCount += item.itemCount || 0;
      target.invoiceCount += item.invoiceCount || 0;
      if (item.checkoutDetails && item.checkoutDetails.length > 0) {
        target.checkoutDetails.push(...item.checkoutDetails);
      }
    });

    // Recalculate stockRemaining for each consolidated item
    consolidatedMap.forEach(item => {
      item.stockRemaining = item.totalPurchased
                          - item.totalSoldBeforeCutoff
                          - item.totalCheckedOutAfterCutoff;
      console.log(`[getSellStock] CONSOLIDATED ${item.categoryName}: Purchased=${item.totalPurchased}, SoldBeforeCutoff=${item.totalSoldBeforeCutoff}, CheckoutAfterCutoff=${item.totalCheckedOutAfterCutoff}, Remaining=${item.stockRemaining}`);
    });

    const stockData = Array.from(consolidatedMap.values()).sort((a, b) =>
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
  async getStockSummary() {
    console.time('[StockSummary] Total time');
    console.time('[StockSummary] Step 1: Metadata');
    const cacheKey = 'stock_summary_metadata';
    let metadata = this._cacheGet(cacheKey);
    if (!metadata) {
      const [forUseItems, forSellItems, aliasData, mappings] = await Promise.all([
        RouteStarItem.find({ forUse: true }).select('itemName').lean(),
        RouteStarItem.find({ forSell: true }).select('itemName').lean(),
        RouteStarItemAlias.find({ isActive: true }).select('canonicalName aliases.name').lean(),
        ModelCategory.find().select('modelNumber categoryItemName').lean()
      ]);
      metadata = { forUseItems, forSellItems, aliasData, mappings };
      this._cacheSet(cacheKey, metadata, 10); 
    }
    const { forUseItems, forSellItems, aliasData, mappings } = metadata;
    console.timeEnd('[StockSummary] Step 1: Metadata');
    const Settings = require('../models/Settings');
    const settings = await Settings.getSettings();
    const cutoffDate = settings.stockCalculationCutoffDate;
    console.log(`[StockSummary] Cutoff Date: ${cutoffDate ? cutoffDate.toISOString().split('T')[0] : 'Not Set'}`);
    const useAllowedSet = new Set(forUseItems.map(item => item.itemName));
    const sellAllowedSet = new Set(forSellItems.map(item => item.itemName));
    console.time('[StockSummary] Step 1.5: Build SKU maps');

    // Build canonical names FIRST before building SKU lists
    const aliasToCanonicalMap = new Map();
    const sellVariationsSet = new Set();
    const canonicalNamesForSell = new Set();

    aliasData.forEach(mapping => {
      const hasAllowedAlias = mapping.aliases.some(alias =>
        sellAllowedSet.has(alias.name)
      );
      if (hasAllowedAlias) {
        canonicalNamesForSell.add(mapping.canonicalName);
        sellVariationsSet.add(mapping.canonicalName);
        sellVariationsSet.add(mapping.canonicalName.toLowerCase());

        mapping.aliases.forEach(alias => {
          const aliasLower = alias.name.toLowerCase();
          aliasToCanonicalMap.set(aliasLower, mapping.canonicalName);
          sellVariationsSet.add(alias.name);
          sellVariationsSet.add(aliasLower);
        });
      }
    });

    // Create expanded allowed set that includes canonical names
    const expandedSellAllowedSet = new Set([...sellAllowedSet, ...canonicalNamesForSell]);

    const skuToCategoryMap = new Map();
    const useSKUs = [];
    const sellSKUs = [];
    mappings.forEach(m => {
      if (m.modelNumber && m.categoryItemName) {
        skuToCategoryMap.set(m.modelNumber, m.categoryItemName);
        if (useAllowedSet.has(m.categoryItemName)) {
          useSKUs.push(m.modelNumber);
        }
        // Use expanded set that includes canonical names
        if (expandedSellAllowedSet.has(m.categoryItemName)) {
          sellSKUs.push(m.modelNumber);
        }
      }
    });

    // Add any unmapped items from sellAllowedSet
    sellAllowedSet.forEach(c => {
      if (!aliasToCanonicalMap.has(c.toLowerCase())) {
        sellVariationsSet.add(c);
        sellVariationsSet.add(c.toLowerCase());
      }
    });
    const sellVariationsArray = Array.from(sellVariationsSet);
    console.timeEnd('[StockSummary] Step 1.5: Build SKU maps');
    console.log(`[StockSummary] Use: ${useAllowedSet.size} cats, ${useSKUs.length} SKUs | Sell: ${sellAllowedSet.size} cats, ${sellSKUs.length} SKUs, ${sellVariationsArray.length} variations`);
    console.time('[StockSummary] Step 1.6: Extract sales keywords from purchases');
    const keywordCacheKey = `sales_keywords_${sellSKUs.length}`;
    let keywordData = this._cacheGet(keywordCacheKey);
    if (!keywordData) {
      const skuToItemNameMap = new Map();
      const salesKeywordsSet = new Set();

      // Query both CustomerConnect and Manual orders
      const [ccSkuOrders, manualSkuOrders] = await Promise.all([
        CustomerConnectOrder.aggregate([
          {
            $match: {
              status: { $in: ['Complete', 'Processing', 'Shipped'] },
              verified: true,
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
            $group: {
              _id: {
                sku: { $toUpper: '$items.sku' },
                name: '$items.name'
              }
            }
          },
          {
            $project: {
              _id: 0,
              sku: '$_id.sku',
              name: '$_id.name'
            }
          },
          { $limit: 300 }
        ]),
        PurchaseOrder.aggregate([
          {
            $match: {
              source: 'manual',
              status: { $in: ['confirmed', 'received', 'completed'] },
              verified: true,
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
            $group: {
              _id: {
                sku: { $toUpper: '$items.sku' },
                name: '$items.name'
              }
            }
          },
          {
            $project: {
              _id: 0,
              sku: '$_id.sku',
              name: '$_id.name'
            }
          },
          { $limit: 300 }
        ])
      ]);

      // Combine and process keywords from both sources
      [...ccSkuOrders, ...manualSkuOrders].forEach(item => {
        if (item.sku && item.name) {
          skuToItemNameMap.set(item.sku, item.name);
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
          const words = item.name.split(/[\s,]+/);
          words.forEach(word => {
            const cleaned = word.replace(/[^A-Za-z0-9]/g, '');
            if (cleaned && cleaned.length > 2 && cleaned === cleaned.toUpperCase()) {
              salesKeywordsSet.add(cleaned);
              salesKeywordsSet.add(cleaned.toLowerCase());
            }
          });
        }
      });
      keywordData = { skuToItemNameMap, salesKeywordsSet };
      this._cacheSet(keywordCacheKey, keywordData, 10); 
    }
    const { skuToItemNameMap, salesKeywordsSet } = keywordData;
    salesKeywordsSet.forEach(kw => sellVariationsSet.add(kw));
    const finalSellVariationsArray = Array.from(sellVariationsSet);
    console.timeEnd('[StockSummary] Step 1.6: Extract sales keywords from purchases');
    console.log(`[StockSummary] Extracted ${salesKeywordsSet.size} sales keywords from item names`);
    console.time('[StockSummary] Step 2: Mega query');
    const [ccOrdersResult, manualOrdersResult, invoicesResult, checkoutsResult, discrepanciesResult] = await Promise.all([
      // CustomerConnect orders
      (useSKUs.length > 0 || sellSKUs.length > 0) ? CustomerConnectOrder.aggregate([
        {
          $match: {
            status: { $in: ['Complete', 'Processing', 'Shipped'] },
            verified: true,
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
      ], { allowDiskUse: true, maxTimeMS: 5000 }) : Promise.resolve([{ usePurchases: [], sellPurchases: [] }]),
      // Manual orders
      (useSKUs.length > 0 || sellSKUs.length > 0) ? PurchaseOrder.aggregate([
        {
          $match: {
            source: 'manual',
            status: { $in: ['confirmed', 'received', 'completed'] },
            verified: true,
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
      ], { allowDiskUse: true, maxTimeMS: 5000 }) : Promise.resolve([{ usePurchases: [], sellPurchases: [] }]),
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
          $facet: {
            allInvoices: [
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
            ],
            invoicesBeforeCutoff: cutoffDate ? [
              {
                $match: {
                  invoiceDate: { $lt: cutoffDate }
                }
              },
              {
                $group: {
                  _id: { $toLower: '$lineItems.name' },
                  totalSoldBeforeCutoff: { $sum: '$lineItems.quantity' }
                }
              },
              {
                $project: {
                  itemName: '$_id',
                  totalSoldBeforeCutoff: 1,
                  _id: 0
                }
              }
            ] : [
              {
                $group: {
                  _id: { $toLower: '$lineItems.name' },
                  totalSoldBeforeCutoff: { $sum: '$lineItems.quantity' }
                }
              },
              {
                $project: {
                  itemName: '$_id',
                  totalSoldBeforeCutoff: 1,
                  _id: 0
                }
              }
            ]
          }
        }
      ]) : Promise.resolve([{ allInvoices: [], invoicesBeforeCutoff: [] }]),
      finalSellVariationsArray.length > 0 ? TruckCheckout.aggregate([
        {
          $match: {
            status: 'checked_out',
            $or: [
              { 'itemsTaken.0': { $exists: true } },
              { 'itemName': { $exists: true } }
            ]
          }
        },
        {
          $facet: {
            allCheckoutsOld: [
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
            allCheckoutsNew: [
              { $match: { 'itemName': { $exists: true, $in: finalSellVariationsArray } } },
              {
                $group: {
                  _id: { $toLower: '$itemName' },
                  totalCheckedOut: { $sum: '$quantityTaking' }
                }
              }
            ],
            checkoutsAfterCutoffOld: cutoffDate ? [
              {
                $match: {
                  checkoutDate: { $gte: cutoffDate },
                  'itemsTaken.0': { $exists: true }
                }
              },
              { $unwind: '$itemsTaken' },
              {
                $match: {
                  'itemsTaken.name': { $in: finalSellVariationsArray }
                }
              },
              {
                $group: {
                  _id: { $toLower: '$itemsTaken.name' },
                  totalCheckedOutAfterCutoff: { $sum: '$itemsTaken.quantity' }
                }
              }
            ] : [{ $match: { _id: null } }],
            checkoutsAfterCutoffNew: cutoffDate ? [
              {
                $match: {
                  checkoutDate: { $gte: cutoffDate },
                  'itemName': { $exists: true, $in: finalSellVariationsArray }
                }
              },
              {
                $group: {
                  _id: { $toLower: '$itemName' },
                  totalCheckedOutAfterCutoff: { $sum: '$quantityTaking' }
                }
              }
            ] : [{ $match: { _id: null } }]
          }
        }
      ]) : Promise.resolve([{ allCheckoutsOld: [], allCheckoutsNew: [], checkoutsAfterCutoffOld: [], checkoutsAfterCutoffNew: [] }]),
      (finalSellVariationsArray.length > 0 || sellSKUs.length > 0) ? StockDiscrepancy.find({
        $or: [
          { categoryName: { $in: finalSellVariationsArray } },
          { itemName: { $in: finalSellVariationsArray } },
          { itemSku: { $in: sellSKUs } }
        ]
      }).lean() : Promise.resolve([])
    ]);

    // Merge CustomerConnect and Manual order results
    const ccUsePurchases = ccOrdersResult[0]?.usePurchases || [];
    const ccSellPurchases = ccOrdersResult[0]?.sellPurchases || [];
    const manualUsePurchases = manualOrdersResult[0]?.usePurchases || [];
    const manualSellPurchases = manualOrdersResult[0]?.sellPurchases || [];

    // Combine and merge by SKU
    const usePurchasesMap = new Map();
    [...ccUsePurchases, ...manualUsePurchases].forEach(item => {
      if (usePurchasesMap.has(item._id)) {
        const existing = usePurchasesMap.get(item._id);
        existing.totalQuantity += item.totalQuantity || 0;
        existing.totalValue += item.totalValue || 0;
        existing.itemCount += item.itemCount || 0;
      } else {
        usePurchasesMap.set(item._id, { ...item });
      }
    });
    const usePurchases = Array.from(usePurchasesMap.values());

    const sellPurchasesMap = new Map();
    [...ccSellPurchases, ...manualSellPurchases].forEach(item => {
      if (sellPurchasesMap.has(item._id)) {
        const existing = sellPurchasesMap.get(item._id);
        existing.totalPurchased += item.totalPurchased || 0;
        existing.totalPurchaseValue += item.totalPurchaseValue || 0;
        existing.itemCount += item.itemCount || 0;
      } else {
        sellPurchasesMap.set(item._id, { ...item });
      }
    });
    const sellPurchases = Array.from(sellPurchasesMap.values());
    const allInvoices = invoicesResult[0]?.allInvoices || [];
    const invoicesBeforeCutoff = invoicesResult[0]?.invoicesBeforeCutoff || [];
    const allCheckoutsOld = checkoutsResult[0]?.allCheckoutsOld || [];
    const allCheckoutsNew = checkoutsResult[0]?.allCheckoutsNew || [];
    const checkoutsAfterCutoffOld = checkoutsResult[0]?.checkoutsAfterCutoffOld || [];
    const checkoutsAfterCutoffNew = checkoutsResult[0]?.checkoutsAfterCutoffNew || [];
    const allCheckoutsMap = new Map();
    [...allCheckoutsOld, ...allCheckoutsNew].forEach(item => {
      const key = item._id || item.itemName;
      if (!allCheckoutsMap.has(key)) {
        allCheckoutsMap.set(key, { itemName: key, totalCheckedOut: 0 });
      }
      allCheckoutsMap.get(key).totalCheckedOut += item.totalCheckedOut || 0;
    });
    const allCheckoutsData = Array.from(allCheckoutsMap.values());
    const checkoutsAfterCutoffMap = new Map();
    [...checkoutsAfterCutoffOld, ...checkoutsAfterCutoffNew].forEach(item => {
      const key = item._id || item.itemName;
      if (!checkoutsAfterCutoffMap.has(key)) {
        checkoutsAfterCutoffMap.set(key, { itemName: key, totalCheckedOutAfterCutoff: 0 });
      }
      checkoutsAfterCutoffMap.get(key).totalCheckedOutAfterCutoff += item.totalCheckedOutAfterCutoff || 0;
    });
    const checkoutsAfterCutoffData = Array.from(checkoutsAfterCutoffMap.values());
    const rawDiscrepancies = discrepanciesResult;
    const getCanonical = (name) => {
      const nameLower = name.toLowerCase();
      return aliasToCanonicalMap.get(nameLower) || name;
    };
    const discrepancyMap = new Map();
    rawDiscrepancies.forEach(disc => {
      let targetCategory = null;
      if (disc.itemSku && skuToCategoryMap.has(disc.itemSku)) {
        targetCategory = skuToCategoryMap.get(disc.itemSku);
      }
      if (!targetCategory || !(sellAllowedSet.has(targetCategory) || expandedSellAllowedSet.has(targetCategory))) {
        targetCategory = getCanonical(disc.categoryName || '');
      }
      if (!targetCategory || !(sellAllowedSet.has(targetCategory) || expandedSellAllowedSet.has(targetCategory))) {
        targetCategory = getCanonical(disc.itemName || '');
      }
      if (targetCategory && (sellAllowedSet.has(targetCategory) || expandedSellAllowedSet.has(targetCategory))) {
        console.log(`[StockSummary] Processing discrepancy for SKU=${disc.itemSku}, categoryName=${disc.categoryName}, targetCategory=${targetCategory}`);
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
      } else {
        console.log(`[StockSummary] SKIPPING discrepancy for SKU=${disc.itemSku}, categoryName=${disc.categoryName}, targetCategory=${targetCategory}, reason=notInAllowedSet`);
      }
    });
    const discrepancies = Array.from(discrepancyMap.entries()).map(([categoryName, data]) => ({
      categoryName,
      ...data
    }));
    console.timeEnd('[StockSummary] Step 2: Mega query');
    console.time('[StockSummary] Step 3: Build result maps');
    const lowercaseToCategoryMap = new Map();
    sellAllowedSet.forEach(category => {
      lowercaseToCategoryMap.set(category.toLowerCase(), category);
    });
    const keywordToCategoriesMap = new Map();
    const extractedKeywords = Array.from(salesKeywordsSet);
    for (const [sku, itemName] of skuToItemNameMap.entries()) {
      const category = skuToCategoryMap.get(sku);
      if (category && sellAllowedSet.has(category)) {
        const itemNameUpper = itemName.toUpperCase();
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
    const salesByCategory = new Map();
    const salesBeforeCutoffByCategory = new Map();
    allInvoices.forEach(s => {
      const itemNameLower = s.itemName.toLowerCase();
      let targetCategory = lowercaseToCategoryMap.get(itemNameLower);
      if (!targetCategory) {
        targetCategory = getCanonical(s.itemName);
        if (!sellAllowedSet.has(targetCategory)) {
          targetCategory = lowercaseToCategoryMap.get(targetCategory.toLowerCase());
        }
      }
      if (!targetCategory || !sellAllowedSet.has(targetCategory)) {
        const itemNameUpper = s.itemName.toUpperCase();
        if (keywordToCategoriesMap.has(itemNameUpper)) {
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
          return;
        }
      }
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
    invoicesBeforeCutoff.forEach(s => {
      const itemNameLower = s.itemName.toLowerCase();
      let targetCategory = lowercaseToCategoryMap.get(itemNameLower);
      if (!targetCategory) {
        targetCategory = getCanonical(s.itemName);
        if (!sellAllowedSet.has(targetCategory)) {
          targetCategory = lowercaseToCategoryMap.get(targetCategory.toLowerCase());
        }
      }
      if (!targetCategory || !sellAllowedSet.has(targetCategory)) {
        const itemNameUpper = s.itemName.toUpperCase();
        if (keywordToCategoriesMap.has(itemNameUpper)) {
          const relevantCategories = Array.from(keywordToCategoriesMap.get(itemNameUpper));
          relevantCategories.forEach(cat => {
            if (!salesBeforeCutoffByCategory.has(cat)) {
              salesBeforeCutoffByCategory.set(cat, {
                totalSoldBeforeCutoff: 0
              });
            }
            const categoryData = salesBeforeCutoffByCategory.get(cat);
            categoryData.totalSoldBeforeCutoff += s.totalSoldBeforeCutoff || 0;
          });
          return;
        }
      }
      if (targetCategory && sellAllowedSet.has(targetCategory)) {
        if (!salesBeforeCutoffByCategory.has(targetCategory)) {
          salesBeforeCutoffByCategory.set(targetCategory, {
            totalSoldBeforeCutoff: 0
          });
        }
        const categoryData = salesBeforeCutoffByCategory.get(targetCategory);
        categoryData.totalSoldBeforeCutoff += s.totalSoldBeforeCutoff || 0;
      }
    });
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

    const sellStockMap = new Map();
    sellPurchases.forEach(p => {
      const originalCategory = skuToCategoryMap.get(p._id);

      // Skip if no mapping
      if (!originalCategory) {
        return;
      }

      // Convert to canonical name if mapped
      const categoryLower = originalCategory.toLowerCase();
      const category = aliasToCanonicalMap.get(categoryLower) || originalCategory;

      // Check if either the original OR canonical name is in our allowed sets
      const isAllowed = sellAllowedSet.has(originalCategory) || expandedSellAllowedSet.has(category);

      if (!isAllowed) {
        return;
      }

      if (!sellStockMap.has(category)) {
        sellStockMap.set(category, {
          categoryName: category,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
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
    });
    salesByCategory.forEach((saleData, category) => {
      // category is already canonical from earlier processing
      if (!sellStockMap.has(category)) {
        sellStockMap.set(category, {
          categoryName: category,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
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
    });
    salesBeforeCutoffByCategory.forEach((saleData, category) => {
      // category is already canonical from earlier processing
      if (!sellStockMap.has(category)) {
        sellStockMap.set(category, {
          categoryName: category,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        });
      }
      const stock = sellStockMap.get(category);
      stock.totalSoldBeforeCutoff += saleData.totalSoldBeforeCutoff || 0;
    });
    allCheckoutsData.forEach(c => {
      // Check if original item name is allowed
      if (!sellAllowedSet.has(c.itemName)) {
        return;
      }

      const canonical = getCanonical(c.itemName);
      if (!sellStockMap.has(canonical)) {
        sellStockMap.set(canonical, {
          categoryName: canonical,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        });
      }
      const stock = sellStockMap.get(canonical);
      stock.totalCheckedOut += c.totalCheckedOut || 0;
    });
    checkoutsAfterCutoffData.forEach(c => {
      // Check if original item name is allowed
      if (!sellAllowedSet.has(c.itemName)) {
        return;
      }

      const canonical = getCanonical(c.itemName);
      if (!sellStockMap.has(canonical)) {
        sellStockMap.set(canonical, {
          categoryName: canonical,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        });
      }
      const stock = sellStockMap.get(canonical);
      stock.totalCheckedOutAfterCutoff += c.totalCheckedOutAfterCutoff || 0;
    });
    discrepancies.forEach(d => {
      // d.categoryName is already canonical from earlier processing
      const canonical = d.categoryName;
      if (!sellStockMap.has(canonical)) {
        sellStockMap.set(canonical, {
          categoryName: canonical,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
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
    });
    sellStockMap.forEach((item, category) => {
      const discrepancy = discrepancies.find(d => d.categoryName === category);
      const adjustment = discrepancy ? (discrepancy.approvedAdjustment || 0) : 0;
      item.stockRemaining = item.totalPurchased
                          - item.totalSoldBeforeCutoff
                          - item.totalCheckedOutAfterCutoff
                          + adjustment;
      console.log(`[StockSummary] ${category}: Purchased=${item.totalPurchased}, SoldBeforeCutoff=${item.totalSoldBeforeCutoff}, CheckoutAfterCutoff=${item.totalCheckedOutAfterCutoff}, Adjustment=${adjustment}, Remaining=${item.stockRemaining}`);
    });

    // Add canonical names that don't have any data yet
    canonicalNamesForSell.forEach(canonicalName => {
      if (!sellStockMap.has(canonicalName)) {
        sellStockMap.set(canonicalName, {
          categoryName: canonicalName,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        });
      }
    });

    // Also add any unmapped items from forSellItems
    forSellItems.forEach(item => {
      const itemName = item.itemName;
      const itemNameLower = itemName.toLowerCase();
      const canonicalName = aliasToCanonicalMap.get(itemNameLower) || itemName;

      if (!sellStockMap.has(canonicalName)) {
        sellStockMap.set(canonicalName, {
          categoryName: canonicalName,
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        });
      }
    });

    // CONSOLIDATION: Merge all sell stock items by their canonical names
    const consolidatedSellMap = new Map();
    Array.from(sellStockMap.values()).forEach(item => {
      const itemNameLower = item.categoryName.toLowerCase();
      const canonical = aliasToCanonicalMap.get(itemNameLower) || item.categoryName;

      if (!consolidatedSellMap.has(canonical)) {
        consolidatedSellMap.set(canonical, {
          categoryName: canonical,
          aliases: [],
          totalPurchased: 0,
          totalPurchaseValue: 0,
          totalSold: 0,
          totalSoldBeforeCutoff: 0,
          totalSalesValue: 0,
          totalCheckedOut: 0,
          totalCheckedOutAfterCutoff: 0,
          totalDiscrepancies: 0,
          totalDiscrepancyDifference: 0,
          itemCount: 0,
          invoiceCount: 0,
          stockRemaining: 0
        });
      }

      const target = consolidatedSellMap.get(canonical);

      // Track aliases that were merged into this canonical name
      if (item.categoryName !== canonical && !target.aliases.includes(item.categoryName)) {
        target.aliases.push(item.categoryName);
      }

      target.totalPurchased += item.totalPurchased || 0;
      target.totalPurchaseValue += item.totalPurchaseValue || 0;
      target.totalSold += item.totalSold || 0;
      target.totalSoldBeforeCutoff += item.totalSoldBeforeCutoff || 0;
      target.totalSalesValue += item.totalSalesValue || 0;
      target.totalCheckedOut += item.totalCheckedOut || 0;
      target.totalCheckedOutAfterCutoff += item.totalCheckedOutAfterCutoff || 0;
      target.totalDiscrepancies += item.totalDiscrepancies || 0;
      target.totalDiscrepancyDifference += item.totalDiscrepancyDifference || 0;
      target.itemCount += item.itemCount || 0;
      target.invoiceCount += item.invoiceCount || 0;
    });

    // Recalculate stockRemaining for each consolidated item
    consolidatedSellMap.forEach(item => {
      item.stockRemaining = item.totalPurchased
                          - item.totalSoldBeforeCutoff
                          - item.totalCheckedOutAfterCutoff;
      console.log(`[StockSummary] CONSOLIDATED ${item.categoryName}: Purchased=${item.totalPurchased}, SoldBeforeCutoff=${item.totalSoldBeforeCutoff}, CheckoutAfterCutoff=${item.totalCheckedOutAfterCutoff}, Remaining=${item.stockRemaining}`);
    });

    console.timeEnd('[StockSummary] Step 3: Build result maps');
    console.time('[StockSummary] Step 4: Sort and totals');
    const useStock = Array.from(useStockMap.values()).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );
    const sellStock = Array.from(consolidatedSellMap.values()).sort((a, b) =>
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
  _getItemVariations(canonicalName, aliasMap) {
    const variations = [canonicalName, canonicalName.toLowerCase()];
    Object.keys(aliasMap).forEach(alias => {
      if (aliasMap[alias] === canonicalName) {
        variations.push(alias);
      }
    });
    return variations;
  }
  _getCanonicalName(itemName, aliasMap) {
    return aliasMap[itemName.toLowerCase()] || itemName;
  }
}
module.exports = new StockService();
