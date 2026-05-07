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

    const query = {};
    if (status) query.status = status;
    if (vendor) query['vendor.name'] = new RegExp(vendor, 'i');
    if (stockProcessed !== undefined) query.stockProcessed = stockProcessed === 'true';

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

    const [ccOrders, manualOrders] = await Promise.all([
      CustomerConnectOrder.find(ccQuery)
        .select('orderNumber orderDate status total stockProcessed verified vendor.name items')
        .lean(),

      PurchaseOrder.find({ ...query, source: 'manual' })
        .select('orderNumber orderDate status total stockProcessed verified vendor.name items source')
        .lean()
    ]);

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
        verified: order.verified,
        vendor: { name: order.vendor?.name },
        itemCount: order.items?.length || 0,
        source: 'manual'
      }))
    ];

    allOrders.sort((a, b) => {
      const aNum = parseInt(a.orderNumber.replace(/\D/g, '')) || 0;
      const bNum = parseInt(b.orderNumber.replace(/\D/g, '')) || 0;
      return bNum - aNum;
    });

    const total = allOrders.length;

    const paginatedOrders = allOrders.slice(skip, skip + limitNum);

    const now = Date.now();
    const shouldFetchRange = includeRange && (!rangeCache.timestamp || (now - rangeCache.timestamp > rangeCache.ttl));

    if (shouldFetchRange && allOrders.length > 0) {
      const highest = allOrders[0];
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
    let order = await CustomerConnectOrder.findByOrderNumber(orderNumber);

    if (!order) {
      order = await PurchaseOrder.findOne({ orderNumber, source: 'manual' });
      if (order) {
        order = order.toObject();
        order.source = 'manual';
      }
    } else {
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

    // Combine orders from both CustomerConnectOrder and PurchaseOrder (manual orders)
    const result = await CustomerConnectOrder.aggregate([
      // Match synced orders from CustomerConnect
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
      // Union with manual PurchaseOrders
      {
        $unionWith: {
          coll: 'purchaseorders',
          pipeline: [
            {
              $match: {
                status: { $in: ['confirmed', 'received', 'completed'] }
              }
            },
            {
              $project: {
                items: 1
              }
            }
          ]
        }
      },
      { $unwind: '$items' },
      ...(search ? [{
        $match: {
          $or: [
            { 'items.name': { $regex: search, $options: 'i' } },
            { 'items.sku': { $regex: search, $options: 'i' } }
          ]
        }
      }] : []),
      {
        $group: {
          _id: '$items.sku',
          name: { $first: '$items.name' },
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
          sku: '$_id',
          name: 1,
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

    // Delete from both CustomerConnectOrder and PurchaseOrder (manual orders)
    const [ccResult, poResult] = await Promise.all([
      CustomerConnectOrder.deleteMany({
        'items.sku': { $in: skus }
      }),
      PurchaseOrder.deleteMany({
        'items.sku': { $in: skus }
      })
    ]);

    const totalDeleted = ccResult.deletedCount + poResult.deletedCount;
    console.log(`[Bulk Delete] Deleted ${ccResult.deletedCount} CustomerConnect orders and ${poResult.deletedCount} manual orders (${totalDeleted} total)`);

    return {
      deletedCount: totalDeleted,
      ccDeletedCount: ccResult.deletedCount,
      poDeletedCount: poResult.deletedCount,
      skus: skus
    };
  }
  async bulkDeleteByOrderNumbers(orderNumbers) {
    console.log(`[Bulk Delete Orders] Deleting orders with numbers: ${orderNumbers.join(', ')}`);

    // Delete from both CustomerConnectOrder and PurchaseOrder (manual orders)
    const [ccResult, poResult] = await Promise.all([
      CustomerConnectOrder.deleteMany({
        orderNumber: { $in: orderNumbers }
      }),
      PurchaseOrder.deleteMany({
        orderNumber: { $in: orderNumbers }
      })
    ]);

    const totalDeleted = ccResult.deletedCount + poResult.deletedCount;
    console.log(`[Bulk Delete Orders] Deleted ${ccResult.deletedCount} CustomerConnect orders and ${poResult.deletedCount} manual orders (${totalDeleted} total)`);

    return {
      deletedCount: totalDeleted,
      ccDeletedCount: ccResult.deletedCount,
      poDeletedCount: poResult.deletedCount,
      orderNumbers: orderNumbers
    };
  }
  async getOrdersBySKU(sku) {
    console.log(`[getOrdersBySKU] Looking for SKU: ${sku}`);

    // Query both CustomerConnectOrder and PurchaseOrder (manual orders)
    const [ccOrders, poOrders] = await Promise.all([
      CustomerConnectOrder.find({
        'items.sku': { $regex: new RegExp(`^${sku}$`, 'i') }
      })
      .populate('items.itemVerifiedBy', 'username name')
      .sort({ orderNumber: -1 })
      .lean(),

      PurchaseOrder.find({
        'items.sku': { $regex: new RegExp(`^${sku}$`, 'i') }
      })
      .populate('items.itemVerifiedBy', 'username name')
      .sort({ orderNumber: -1 })
      .lean()
    ]);

    console.log(`[getOrdersBySKU] Found ${ccOrders.length} CustomerConnect orders and ${poOrders.length} manual orders`);

    // Extract matching entries from CustomerConnect orders
    const ccEntries = ccOrders.map(order => {
      // Find matching items and their indices
      const entries = [];
      order.items.forEach((item, itemIndex) => {
        if (item.sku.toLowerCase() === sku.toLowerCase()) {
          entries.push({
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
            stockProcessed: order.stockProcessed,
            itemVerified: item.itemVerified || false,
            itemVerifiedAt: item.itemVerifiedAt,
            itemVerifiedBy: item.itemVerifiedBy,
            receivedQuantity: item.receivedQuantity || 0,
            remainingQuantity: item.remainingQuantity !== undefined ? item.remainingQuantity : item.qty,
            verificationHistory: item.verificationHistory || [],
            itemIndex: itemIndex // Add the actual index within the order's items array
          });
        }
      });
      return entries;
    }).flat();

    // Extract matching entries from manual PurchaseOrders
    const poEntries = poOrders.map(order => {
      // Find matching items and their indices
      const entries = [];
      order.items.forEach((item, itemIndex) => {
        if (item.sku.toLowerCase() === sku.toLowerCase()) {
          entries.push({
            orderNumber: order.orderNumber,
            poNumber: null, // Manual orders don't have PO number from CustomerConnect
            orderDate: order.orderDate,
            status: order.status,
            vendor: order.vendor?.name || 'N/A',
            sku: item.sku,
            name: item.name,
            qty: item.qty,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            stockProcessed: order.stockProcessed,
            itemVerified: item.itemVerified || false,
            itemVerifiedAt: item.itemVerifiedAt,
            itemVerifiedBy: item.itemVerifiedBy,
            receivedQuantity: item.receivedQuantity || 0,
            remainingQuantity: item.remainingQuantity !== undefined ? item.remainingQuantity : item.qty,
            verificationHistory: item.verificationHistory || [],
            itemIndex: itemIndex // Add the actual index within the order's items array
          });
        }
      });
      return entries;
    }).flat();

    // Combine and sort all entries by order date (newest first)
    const orderEntries = [...ccEntries, ...poEntries].sort((a, b) =>
      new Date(b.orderDate) - new Date(a.orderDate)
    );

    console.log(`[getOrdersBySKU] Extracted ${orderEntries.length} matching entries (${ccEntries.length} from CC, ${poEntries.length} from manual)`);

    if (orderEntries.length > 0) {
      console.log(`[getOrdersBySKU] First entry data:`, {
        orderNumber: orderEntries[0].orderNumber,
        sku: orderEntries[0].sku,
        qty: orderEntries[0].qty,
        receivedQuantity: orderEntries[0].receivedQuantity,
        remainingQuantity: orderEntries[0].remainingQuantity,
        itemIndex: orderEntries[0].itemIndex,
        verificationHistoryLength: orderEntries[0].verificationHistory?.length || 0,
        verificationHistory: orderEntries[0].verificationHistory
      });
    }

    return {
      sku: sku,
      entries: orderEntries,
      totalOrders: ccOrders.length + poOrders.length,
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
  async verifyOrderItem(orderNumber, itemIndex, userId, receivedQty = null, notes = '') {
    const StockProcessor = require('./stockProcessor');

    // Try to find order in CustomerConnectOrder first
    let order = await CustomerConnectOrder.findByOrderNumber(orderNumber);
    let isManualOrder = false;

    // If not found, try PurchaseOrder (manual orders)
    if (!order) {
      order = await PurchaseOrder.findOne({ orderNumber });
      isManualOrder = true;
    }

    if (!order) {
      throw new Error('Order not found');
    }

    if (itemIndex < 0 || itemIndex >= order.items.length) {
      throw new Error('Invalid item index');
    }

    const item = order.items[itemIndex];
    const expectedQuantity = item.qty;
    const previouslyReceived = item.receivedQuantity || 0;

    // If receivedQty is not provided, assume full quantity
    const receivingNow = receivedQty !== null ? parseFloat(receivedQty) : (expectedQuantity - previouslyReceived);

    if (receivingNow <= 0) {
      throw new Error('Received quantity must be greater than 0');
    }

    const newTotalReceived = previouslyReceived + receivingNow;
    const newRemaining = Math.max(0, expectedQuantity - newTotalReceived);

    // Add to verification history
    if (!item.verificationHistory) item.verificationHistory = [];
    const verificationEntry = {
      receivedQty: receivingNow,
      verifiedAt: new Date(),
      verifiedBy: userId,
      notes: notes || `Received ${receivingNow} units`,
      stockProcessed: false,
      stockProcessedAt: null
    };
    item.verificationHistory.push(verificationEntry);

    // Update cumulative totals
    item.receivedQuantity = newTotalReceived;
    item.remainingQuantity = newRemaining;

    console.log(`[verifyOrderItem] Updating item ${item.sku}:`, {
      previouslyReceived,
      receivingNow,
      newTotalReceived,
      newRemaining,
      verificationHistoryLength: item.verificationHistory.length
    });

    // Only mark as fully verified if all quantity received
    if (newTotalReceived >= expectedQuantity) {
      item.itemVerified = true;
      item.itemVerifiedAt = new Date();
      item.itemVerifiedBy = userId;
    } else {
      item.itemVerified = false;
    }

    await order.save();
    console.log(`[verifyOrderItem] Order saved successfully. Item receivedQuantity: ${item.receivedQuantity}`);

    // Process stock immediately for this receipt
    try {
      const verificationIndex = item.verificationHistory.length - 1;
      const verificationId = `${Date.now()}-${verificationIndex}`;

      await StockProcessor.processItemVerification(
        order,
        item,
        receivingNow,
        verificationId,
        userId
      );

      // Mark this verification as stock processed
      item.verificationHistory[verificationIndex].stockProcessed = true;
      item.verificationHistory[verificationIndex].stockProcessedAt = new Date();
      await order.save();

      console.log(`✓ Stock processed for ${item.sku}: +${receivingNow} units`);
    } catch (stockError) {
      console.error(`✗ Failed to process stock for ${item.sku}:`, stockError.message);
      // Don't throw error - verification is saved, stock processing can be retried
    }

    // Check if ALL items in the order are fully verified
    const allItemsVerified = order.items.every(orderItem => orderItem.itemVerified === true);

    if (allItemsVerified && !order.verified) {
      order.verified = true;
      order.verifiedAt = new Date();
      order.verifiedBy = userId;
      await order.save();
      console.log(`✓ Order ${order.orderNumber} marked as fully verified - all items received`);
    }

    return {
      orderNumber: order.orderNumber,
      itemIndex,
      item: order.items[itemIndex],
      isManualOrder,
      partiallyVerified: newTotalReceived < expectedQuantity,
      previouslyReceived,
      receivingNow,
      newTotalReceived,
      remaining: newRemaining,
      fullyReceived: newTotalReceived >= expectedQuantity
    };
  }

  async reprocessFailedVerifications(orderNumber) {
    const StockProcessor = require('./stockProcessor');

    // Try to find order in CustomerConnectOrder first
    let order = await CustomerConnectOrder.findByOrderNumber(orderNumber);
    let isManualOrder = false;

    // If not found, try PurchaseOrder (manual orders)
    if (!order) {
      order = await PurchaseOrder.findOne({ orderNumber });
      isManualOrder = true;
    }

    if (!order) {
      throw new Error('Order not found');
    }

    let processedCount = 0;
    let failedCount = 0;

    // Loop through all items
    for (let itemIndex = 0; itemIndex < order.items.length; itemIndex++) {
      const item = order.items[itemIndex];

      if (!item.verificationHistory || item.verificationHistory.length === 0) {
        continue;
      }

      // Loop through verification history
      for (let historyIndex = 0; historyIndex < item.verificationHistory.length; historyIndex++) {
        const verification = item.verificationHistory[historyIndex];

        // Skip if already processed
        if (verification.stockProcessed) {
          continue;
        }

        try {
          const verificationId = `reprocess-${Date.now()}-${historyIndex}`;

          await StockProcessor.processItemVerification(
            order,
            item,
            verification.receivedQty,
            verificationId,
            verification.verifiedBy
          );

          // Mark this verification as stock processed
          verification.stockProcessed = true;
          verification.stockProcessedAt = new Date();
          processedCount++;

          console.log(`✓ Reprocessed verification for ${item.sku}: +${verification.receivedQty} units`);
        } catch (error) {
          console.error(`✗ Failed to reprocess ${item.sku}:`, error.message);
          failedCount++;
        }
      }
    }

    await order.save();

    return {
      orderNumber: order.orderNumber,
      processedCount,
      failedCount,
      message: `Reprocessed ${processedCount} verification(s), ${failedCount} failed`
    };
  }
}
module.exports = new CustomerConnectService();
