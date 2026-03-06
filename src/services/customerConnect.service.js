const CustomerConnectSyncService = require('./customerConnectSync.service');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
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

    // Build query for filters (common to both sources)
    const query = {};
    if (status) query.status = status;
    if (vendor) query['vendor.name'] = new RegExp(vendor, 'i');
    if (stockProcessed !== undefined) query.stockProcessed = stockProcessed === 'true';

    // Verified filter only applies to CustomerConnect orders
    const ccQuery = { ...query };
    if (verified !== undefined) {
      if (verified === 'true') {
        ccQuery.verified = true;
      } else {
        ccQuery.$or = [
          { verified: false },
          { verified: { $exists: false } }
        ];
      }
    }

    if (startDate || endDate) {
      const dateQuery = {};
      if (startDate) dateQuery.$gte = new Date(startDate);
      if (endDate) dateQuery.$lte = new Date(endDate);
      query.orderDate = dateQuery;
      ccQuery.orderDate = dateQuery;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Query both sources in parallel
    const [ccOrders, manualOrders] = await Promise.all([
      // CustomerConnect orders
      CustomerConnectOrder.find(ccQuery)
        .select('orderNumber orderDate status total stockProcessed verified vendor.name items')
        .lean(),

      // Manual orders from PurchaseOrder collection
      PurchaseOrder.find({ ...query, source: 'manual' })
        .select('orderNumber orderDate status total stockProcessed vendor.name items source')
        .lean()
    ]);

    // Combine and transform both sources
    const allOrders = [
      ...ccOrders.map(order => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        status: order.status,
        total: order.total,
        stockProcessed: order.stockProcessed,
        verified: order.verified,
        vendor: { name: order.vendor?.name },
        itemCount: order.items?.length || 0,
        source: 'customerconnect'
      })),
      ...manualOrders.map(order => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        status: order.status,
        total: order.total,
        stockProcessed: order.stockProcessed,
        verified: undefined, // Manual orders don't have verified field
        vendor: { name: order.vendor?.name },
        itemCount: order.items?.length || 0,
        source: 'manual'
      }))
    ];

    // Sort combined results by orderNumber descending
    allOrders.sort((a, b) => {
      const aNum = parseInt(a.orderNumber.replace(/\D/g, '')) || 0;
      const bNum = parseInt(b.orderNumber.replace(/\D/g, '')) || 0;
      return bNum - aNum;
    });

    // Get total count
    const total = allOrders.length;

    // Paginate the combined results
    const paginatedOrders = allOrders.slice(skip, skip + limitNum);

    // Get range data if needed
    const now = Date.now();
    const shouldFetchRange = includeRange && (!rangeCache.timestamp || (now - rangeCache.timestamp > rangeCache.ttl));

    if (shouldFetchRange && allOrders.length > 0) {
      const highest = allOrders[0]; // Already sorted descending
      const lowest = allOrders[allOrders.length - 1];

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
      orders: paginatedOrders,
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
    // Check CustomerConnect orders first
    let order = await CustomerConnectOrder.findByOrderNumber(orderNumber);

    // If not found, check manual orders
    if (!order) {
      order = await PurchaseOrder.findOne({ orderNumber, source: 'manual' });
      if (order) {
        // Add source field to identify as manual order
        order = order.toObject();
        order.source = 'manual';
      }
    } else {
      // Add source field to identify as CustomerConnect order
      order = order.toObject ? order.toObject() : order;
      order.source = 'customerconnect';
    }

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
