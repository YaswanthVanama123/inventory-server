const CustomerConnectOrder = require('../models/CustomerConnectOrder');
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
    const aliasMap = await RouteStarItemAlias.buildLookupMap();
    console.timeEnd('[getCategorySales] Step 1: Load aliases');

    
    const variations = this._getItemVariations(categoryName, aliasMap);

    console.log(`Finding data for category: ${categoryName}, variations:`, variations);

    
    console.time('[getCategorySales] Step 2: Get mappings');
    const mappings = await ModelCategory.find({
      categoryItemName: categoryName
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
    const [purchaseData, salesData, checkoutData, discrepancies] = await Promise.all([
      
      CustomerConnectOrder.aggregate([
        {
          $match: {
            status: { $in: ['Complete', 'Processing', 'Shipped'] },
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
                status: '$status'
              }
            }
          }
        }
      ]),

      
      RouteStarInvoice.aggregate([
        {
          $match: {
            status: { $in: ['Completed', 'Closed', 'Pending'] },
            'lineItems.name': { $in: variations }
          }
        },
        { $unwind: '$lineItems' },
        {
          $match: {
            'lineItems.name': { $in: variations }
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
              { 'itemsTaken.name': { $in: variations } },
              { itemName: { $in: variations } }
            ]
          }
        },
        {
          $facet: {
            oldStructure: [
              { $match: { 'itemsTaken.0': { $exists: true } } },
              { $unwind: '$itemsTaken' },
              { $match: { 'itemsTaken.name': { $in: variations } } },
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
              { $match: { itemName: { $in: variations } } },
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
          { categoryName: { $in: variations } },
          { itemName: { $in: variations } },
          { itemSku: { $in: skus } }
        ]
      })
        .populate('reportedBy', 'username fullName')
        .populate('resolvedBy', 'username fullName')
        .lean()
    ]);
    console.timeEnd('[getCategorySales] Step 3: Parallel aggregations');

    
    const skuData = {};
    purchaseData.forEach(item => {
      skuData[item._id] = {
        sku: item._id,
        itemName: item.itemName || '',
        totalPurchased: item.totalPurchased || 0,
        totalPurchaseValue: item.totalPurchaseValue || 0,
        totalSold: 0,
        totalSalesValue: 0,
        totalCheckedOut: 0,
        purchaseHistory: item.purchaseHistory || [],
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

      
      skuData[skuUpper].totalSold = categorySalesData.totalSold / skuCount;
      skuData[skuUpper].totalSalesValue = categorySalesData.totalSalesValue / skuCount;
      skuData[skuUpper].salesHistory = categorySalesData.salesHistory || [];

      
      skuData[skuUpper].totalCheckedOut = categoryCheckoutData.totalCheckedOut / skuCount;
      skuData[skuUpper].checkoutHistory = categoryCheckoutData.checkoutHistory || [];

      
      skuData[skuUpper].discrepancyHistory = discrepancies.filter(d =>
        d.itemSku === sku || d.categoryName === categoryName
      );
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

    
    Object.keys(categoryInvoices).forEach(categoryName => {
      if (categoryMap[categoryName]) {
        categoryMap[categoryName].invoiceCount = categoryInvoices[categoryName].size;
      }
    });

    
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

    
    Object.values(categoryMap).forEach(category => {
      const adjustment = category.discrepancyAdjustment || 0;
      category.stockRemaining = category.totalPurchased - category.totalSold - category.totalCheckedOut + adjustment;
      delete category.discrepancyAdjustment;
    });

    
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

    
    const useAllowedSet = new Set(forUseItems.map(item => item.itemName));
    const sellAllowedSet = new Set(forSellItems.map(item => item.itemName));

    
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

    
    console.time('[StockSummary] Step 1.6: Extract sales keywords from purchases');

    
    const keywordCacheKey = `sales_keywords_${sellSKUs.length}`;
    let keywordData = this._cacheGet(keywordCacheKey);

    if (!keywordData) {
      const skuToItemNameMap = new Map();
      const salesKeywordsSet = new Set(); 

      
      const skuOrders = await CustomerConnectOrder.aggregate([
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
      ]);

      skuOrders.forEach(item => {
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

    const [ordersResult, invoicesResult, checkoutsResult, discrepanciesResult] = await Promise.all([
      
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

      
      if (!targetCategory || !sellAllowedSet.has(targetCategory)) {
        targetCategory = getCanonical(disc.categoryName || '');
      }

      
      if (!targetCategory || !sellAllowedSet.has(targetCategory)) {
        targetCategory = getCanonical(disc.itemName || '');
      }

      
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
    sales.forEach(s => {
      
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
      const canonical = d.categoryName; 

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
