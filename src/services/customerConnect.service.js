const CustomerConnectSyncService = require('./customerConnectSync.service');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const FetchHistory = require('../models/FetchHistory');


let rangeCache = {
  data: null,
  timestamp: null,
  ttl: 30000 
};


class CustomerConnectService {
  
  async syncOrders(options) {
    let syncService = null;
    let fetchRecord = null;

    try {
      let { limit = 0, direction = 'new', triggeredBy = 'manual', userId = null } = options;


      fetchRecord = await FetchHistory.startFetch('customer_connect', 'all', {
        limit: limit,
        direction: direction,
        triggeredBy: triggeredBy,
        userId: userId
      });

      if (limit === 0 || limit === null || limit === 'auto') {
        const highestOrder = await CustomerConnectOrder.findOne()
          .sort({ orderNumber: -1 })
          .select('orderNumber')
          .lean();

        if (highestOrder) {
          console.log(`📊 Last stored order: #${highestOrder.orderNumber}`);
          console.log(`🔄 Syncing NEW orders since #${highestOrder.orderNumber}...`);
        } else {
          console.log(`📊 No orders in database. Starting fresh sync...`);
        }

        limit = Infinity;
      } else if (limit === 'Infinity' || limit === Infinity) {
        limit = Infinity;
      } else {
        limit = parseInt(limit);
      }

      syncService = new CustomerConnectSyncService();
      await syncService.init();

      const results = await syncService.syncOrders(limit);

      
      await fetchRecord.markCompleted({
        totalFetched: results.total || 0,
        created: results.created || 0,
        updated: results.updated || 0,
        failed: results.errors?.length || 0
      });

      const limitText = limit === Infinity ? 'all available' : limit;

      return {
        message: `Orders synced successfully (${limitText} ${direction} orders requested)`,
        data: results,
        fetchId: fetchRecord._id
      };
    } catch (error) {
      
      if (fetchRecord) {
        await fetchRecord.markFailed(error.message, { stack: error.stack });
      }
      throw error;
    } finally {
      if (syncService) {
        await syncService.close();
      }
    }
  }

  
  async getOrderRange() {
    const result = await CustomerConnectOrder.aggregate([
      {
        $facet: {
          metadata: [
            { $count: 'total' }
          ],
          highest: [
            { $sort: { orderNumber: -1 } },
            { $limit: 1 },
            { $project: { orderNumber: 1, orderDate: 1, _id: 0 } }
          ],
          lowest: [
            { $sort: { orderNumber: 1 } },
            { $limit: 1 },
            { $project: { orderNumber: 1, orderDate: 1, _id: 0 } }
          ]
        }
      }
    ]);

    const total = result[0]?.metadata[0]?.total || 0;
    const highest = result[0]?.highest[0];
    const lowest = result[0]?.lowest[0];

    return {
      highest: highest?.orderNumber || null,
      lowest: lowest?.orderNumber || null,
      highestDate: highest?.orderDate || null,
      lowestDate: lowest?.orderDate || null,
      totalOrders: total
    };
  }

  
  async syncOrderDetails(orderNumber) {
    let syncService = null;

    try {
      syncService = new CustomerConnectSyncService();
      await syncService.init();

      const order = await syncService.syncOrderDetails(orderNumber);

      return order;
    } finally {
      if (syncService) {
        await syncService.close();
      }
    }
  }

  
  async syncAllOrderDetails(limit) {
    let syncService = null;

    try {
      syncService = new CustomerConnectSyncService();
      await syncService.init();

      const results = await syncService.syncAllOrderDetails(limit);

      return results;
    } finally {
      if (syncService) {
        await syncService.close();
      }
    }
  }

  
  async syncStock() {
    let syncService = null;

    try {
      syncService = new CustomerConnectSyncService();
      await syncService.init();

      const results = await syncService.processStockMovements();

      return results;
    } finally {
      if (syncService) {
        await syncService.close();
      }
    }
  }

  
  async fullSync(options) {
    let syncService = null;

    try {
      const {
        ordersLimit = 100,
        detailsLimit = 50,
        processStock = true
      } = options;

      syncService = new CustomerConnectSyncService();
      await syncService.init();

      const results = await syncService.fullSync({
        ordersLimit,
        detailsLimit,
        processStock
      });

      return results;
    } finally {
      if (syncService) {
        await syncService.close();
      }
    }
  }

  
  async getOrders(filters, options) {
    console.time('[Orders] Query time');

    const {
      status,
      vendor,
      startDate,
      endDate,
      stockProcessed,
      verified
    } = filters;

    const {
      page = 1,
      limit = 50,
      includeRange = true
    } = options;

    const query = {};

    if (status) query.status = status;
    if (vendor) query['vendor.name'] = new RegExp(vendor, 'i');
    if (stockProcessed !== undefined) query.stockProcessed = stockProcessed === 'true';

    
    if (verified !== undefined) {
      if (verified === 'true') {
        query.verified = true;
      } else {
        
        query.$or = [
          { verified: false },
          { verified: { $exists: false } }
        ];
      }
    }

    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate) query.orderDate.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    
    const facetStages = {
      metadata: [
        { $count: 'total' }
      ],
      orders: [
        { $sort: { orderNumber: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        
        {
          $project: {
            _id: 1,
            orderNumber: 1,
            orderDate: 1,
            status: 1,
            total: 1,
            stockProcessed: 1,
            verified: 1,
            'vendor.name': 1,
            itemCount: { $size: { $ifNull: ['$items', []] } }
          }
        }
      ]
    };

    
    const now = Date.now();
    const shouldFetchRange = includeRange && (!rangeCache.timestamp || (now - rangeCache.timestamp > rangeCache.ttl));

    
    if (shouldFetchRange) {
      facetStages.highest = [
        { $sort: { orderNumber: -1 } },
        { $limit: 1 },
        { $project: { orderNumber: 1, orderDate: 1, _id: 0 } }
      ];
      facetStages.lowest = [
        { $sort: { orderNumber: 1 } },
        { $limit: 1 },
        { $project: { orderNumber: 1, orderDate: 1, _id: 0 } }
      ];
    }

    
    const result = await CustomerConnectOrder.aggregate([
      { $match: query },
      { $facet: facetStages }
    ]).allowDiskUse(true);

    const total = result[0]?.metadata[0]?.total || 0;
    const orders = result[0]?.orders || [];

    
    if (shouldFetchRange) {
      const highest = result[0]?.highest[0];
      const lowest = result[0]?.lowest[0];

      rangeCache.data = {
        highest: highest?.orderNumber || null,
        lowest: lowest?.orderNumber || null,
        highestDate: highest?.orderDate || null,
        lowestDate: lowest?.orderDate || null,
        totalOrders: total
      };
      rangeCache.timestamp = now;
    }

    console.timeEnd('[Orders] Query time');

    
    const response = {
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    };

    
    if (includeRange && rangeCache.data) {
      response.range = rangeCache.data;
    }

    return response;
  }

  
  async getOrderByNumber(orderNumber) {
    const order = await CustomerConnectOrder.findByOrderNumber(orderNumber);
    return order;
  }

  
  async getStats(options) {
    const { startDate, endDate, vendor } = options;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const [stats, topVendors, topProducts, statusCounts] = await Promise.all([
      CustomerConnectOrder.getPurchaseStats(start, end, { vendor }),
      CustomerConnectOrder.getTopVendors(start, end, 10),
      CustomerConnectOrder.getTopProducts(start, end, 10),
      CustomerConnectOrder.aggregate([
        {
          $match: {
            orderDate: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    return {
      dateRange: { start, end },
      purchases: stats,
      topVendors,
      topProducts,
      statusBreakdown: statusCounts
    };
  }

  
  async getGroupedItems(options) {
    const {
      page = 1,
      limit = 100,
      sortBy = 'name',
      sortOrder = 'asc',
      search = '',
      minQuantity = 0
    } = options;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    const sortField = sortBy === 'quantity' ? 'totalQuantity' : sortBy === 'value' ? 'totalValue' : 'name';
    const minQty = parseInt(minQuantity);

    
    const result = await CustomerConnectOrder.aggregate([
      
      {
        $match: {
          status: { $in: ['Complete', 'Processing', 'Shipped'] }
        }
      },

      
      {
        $project: {
          items: 1
        }
      },

      
      { $unwind: '$items' },

      
      ...(search ? [{
        $match: {
          $or: [
            { 'items.sku': { $regex: search, $options: 'i' } },
            { 'items.name': { $regex: search, $options: 'i' } }
          ]
        }
      }] : []),

      
      {
        $group: {
          _id: {
            sku: '$items.sku',
            name: '$items.name'
          },
          totalQuantity: { $sum: '$items.qty' },
          totalValue: { $sum: '$items.lineTotal' },
          avgUnitPrice: { $avg: '$items.unitPrice' },
          orderCount: { $sum: 1 }
        }
      },

      
      ...(minQty > 0 ? [{
        $match: {
          totalQuantity: { $gte: minQty }
        }
      }] : []),

      
      {
        $project: {
          _id: 0,
          sku: '$_id.sku',
          name: '$_id.name',
          totalQuantity: 1,
          totalValue: { $round: ['$totalValue', 2] },
          avgUnitPrice: { $round: ['$avgUnitPrice', 2] },
          orderCount: 1
        }
      },

      
      { $sort: { [sortField]: sortDirection } },

      
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skip }, { $limit: limitNum }]
        }
      }
    ]);

    const total = result[0].metadata[0]?.total || 0;
    const items = result[0].data || [];

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    };
  }

  
  async bulkDeleteBySKUs(skus) {
    console.log(`[Bulk Delete] Deleting orders with SKUs: ${skus.join(', ')}`);

    const result = await CustomerConnectOrder.deleteMany({
      'items.sku': { $in: skus }
    });

    console.log(`[Bulk Delete] Deleted ${result.deletedCount} orders`);

    return {
      deletedCount: result.deletedCount,
      skus: skus
    };
  }

  
  async bulkDeleteByOrderNumbers(orderNumbers) {
    console.log(`[Bulk Delete Orders] Deleting orders with numbers: ${orderNumbers.join(', ')}`);

    const result = await CustomerConnectOrder.deleteMany({
      orderNumber: { $in: orderNumbers }
    });

    console.log(`[Bulk Delete Orders] Deleted ${result.deletedCount} orders`);

    return {
      deletedCount: result.deletedCount,
      orderNumbers: orderNumbers
    };
  }

  
  async getOrdersBySKU(sku) {
    console.log(`[getOrdersBySKU] Looking for SKU: ${sku}`);

    const orders = await CustomerConnectOrder.find({
      'items.sku': { $regex: new RegExp(`^${sku}$`, 'i') }
    }).sort({ orderNumber: -1 }).lean();

    console.log(`[getOrdersBySKU] Found ${orders.length} orders`);

    
    const orderEntries = orders.map(order => {
      const matchingItems = order.items.filter(item =>
        item.sku.toLowerCase() === sku.toLowerCase()
      );

      return matchingItems.map(item => ({
        orderNumber: order.orderNumber,
        poNumber: order.poNumber,
        orderDate: order.orderDate,
        status: order.status,
        vendor: order.vendor?.name || 'N/A',
        sku: item.sku,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        stockProcessed: order.stockProcessed
      }));
    }).flat();

    console.log(`[getOrdersBySKU] Extracted ${orderEntries.length} matching entries`);

    return {
      sku: sku,
      entries: orderEntries,
      totalOrders: orders.length,
      totalQuantity: orderEntries.reduce((sum, entry) => sum + entry.qty, 0)
    };
  }

  
  async deleteAllOrders() {
    const count = await CustomerConnectOrder.countDocuments();

    if (count === 0) {
      return {
        message: 'No orders to delete',
        deletedCount: 0
      };
    }

    const result = await CustomerConnectOrder.deleteMany({});

    return {
      message: `Successfully deleted ${result.deletedCount} orders`,
      deletedCount: result.deletedCount
    };
  }
}

module.exports = new CustomerConnectService();
