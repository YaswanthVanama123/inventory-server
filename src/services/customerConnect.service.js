const CustomerConnectSyncService = require('./customerConnectSync.service');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const FetchHistory = require('../models/FetchHistory');

/**
 * CustomerConnect Service
 * Business logic for CustomerConnect operations
 */
class CustomerConnectService {
  /**
   * Sync orders from CustomerConnect
   */
  async syncOrders(options) {
    let syncService = null;
    let fetchRecord = null;

    try {
      let { limit = 0, direction = 'new', triggeredBy = 'manual' } = options;

      // Create fetch history record
      fetchRecord = await FetchHistory.startFetch('customer_connect', 'all', {
        limit: limit,
        direction: direction,
        triggeredBy: triggeredBy
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

      // Mark fetch as completed
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
      // Mark fetch as failed
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

  /**
   * Get order range (highest/lowest)
   */
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

  /**
   * Sync single order details
   */
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

  /**
   * Sync all order details
   */
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

  /**
   * Process stock movements
   */
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

  /**
   * Full sync (orders + details + stock)
   */
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

  /**
   * Get orders with pagination and filtering
   */
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

    // Handle verified filter - treat missing field as false (not verified)
    if (verified !== undefined) {
      if (verified === 'true') {
        query.verified = true;
      } else {
        // For "not verified", match both false and missing field
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

    // Build facet stages
    const facetStages = {
      metadata: [
        { $count: 'total' }
      ],
      orders: [
        { $sort: { orderNumber: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        // Project only fields needed for list view to reduce payload size
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

    // Add range stages if requested
    if (includeRange) {
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

    // Single aggregation with $facet
    const result = await CustomerConnectOrder.aggregate([
      { $match: query },
      { $facet: facetStages }
    ]);

    const total = result[0]?.metadata[0]?.total || 0;
    const orders = result[0]?.orders || [];

    console.timeEnd('[Orders] Query time');

    // Build response
    const response = {
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    };

    // Add range if requested
    if (includeRange) {
      const highest = result[0]?.highest[0];
      const lowest = result[0]?.lowest[0];

      response.range = {
        highest: highest?.orderNumber || null,
        lowest: lowest?.orderNumber || null,
        highestDate: highest?.orderDate || null,
        lowestDate: lowest?.orderDate || null,
        totalOrders: total
      };
    }

    return response;
  }

  /**
   * Get single order by order number
   */
  async getOrderByNumber(orderNumber) {
    const order = await CustomerConnectOrder.findByOrderNumber(orderNumber);
    return order;
  }

  /**
   * Get purchase statistics
   */
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

  /**
   * Get grouped items with aggregation
   */
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

    // Single optimized aggregation
    const result = await CustomerConnectOrder.aggregate([
      // Filter completed orders
      {
        $match: {
          status: { $in: ['Complete', 'Processing', 'Shipped'] }
        }
      },

      // Project needed fields
      {
        $project: {
          items: 1
        }
      },

      // Unwind items
      { $unwind: '$items' },

      // Search filter
      ...(search ? [{
        $match: {
          $or: [
            { 'items.sku': { $regex: search, $options: 'i' } },
            { 'items.name': { $regex: search, $options: 'i' } }
          ]
        }
      }] : []),

      // Group by SKU and name
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

      // Filter by min quantity
      ...(minQty > 0 ? [{
        $match: {
          totalQuantity: { $gte: minQty }
        }
      }] : []),

      // Project final structure
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

      // Sort
      { $sort: { [sortField]: sortDirection } },

      // Facet for data + count
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

  /**
   * Bulk delete orders by SKUs
   */
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

  /**
   * Bulk delete orders by order numbers
   */
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

  /**
   * Get orders for specific SKU
   */
  async getOrdersBySKU(sku) {
    console.log(`[getOrdersBySKU] Looking for SKU: ${sku}`);

    const orders = await CustomerConnectOrder.find({
      'items.sku': { $regex: new RegExp(`^${sku}$`, 'i') }
    }).sort({ orderNumber: -1 }).lean();

    console.log(`[getOrdersBySKU] Found ${orders.length} orders`);

    // Extract matching items
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

  /**
   * Delete all orders
   */
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
