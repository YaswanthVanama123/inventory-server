const PurchaseOrder = require('../models/PurchaseOrder');
const ExternalInvoice = require('../models/ExternalInvoice');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const Product = require('../models/Product');
const StockProcessor = require('../services/stockProcessor');
const SKUMapper = require('../services/skuMapper');

/**
 * Get all purchase orders (including CustomerConnect orders)
 * @route GET /api/warehouse/purchase-orders
 * @access Authenticated
 */
const getPurchaseOrders = async (req, res, next) => {
  try {
    const {
      source,
      status,
      vendor,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'orderDate',
      sortOrder = 'desc',
      includeSync = 'true'
    } = req.query;

    const query = {};

    if (source) query.source = source;
    if (status) query.status = status;
    if (vendor) query['vendor.name'] = { $regex: vendor, $options: 'i' };

    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate) query.orderDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await PurchaseOrder.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const purchaseOrders = await PurchaseOrder.find(query)
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    
    let customerConnectOrders = [];
    let ccTotal = 0;
    if (includeSync === 'true') {
      const ccQuery = {};
      if (status) ccQuery.status = status;
      if (vendor) ccQuery['vendor.name'] = { $regex: vendor, $options: 'i' };
      if (startDate || endDate) {
        ccQuery.orderDate = {};
        if (startDate) ccQuery.orderDate.$gte = new Date(startDate);
        if (endDate) ccQuery.orderDate.$lte = new Date(endDate);
      }

      ccTotal = await CustomerConnectOrder.countDocuments(ccQuery);
      customerConnectOrders = await CustomerConnectOrder.find(ccQuery)
        .populate('createdBy', 'username fullName')
        .populate('lastUpdatedBy', 'username fullName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));
    }

    
    const enrichedPurchaseOrders = purchaseOrders.map(order => ({
      ...order.toObject(),
      syncMetadata: {
        source: order.source || 'manual',
        lastSynced: order.lastSyncedAt || order.updatedAt,
        stockProcessed: order.stockProcessed || false,
        stockProcessedAt: order.stockProcessedAt || null
      }
    }));

    const enrichedCCOrders = customerConnectOrders.map(order => ({
      ...order.toObject(),
      syncMetadata: {
        source: 'customerconnect',
        lastSynced: order.lastSyncedAt,
        stockProcessed: order.stockProcessed,
        stockProcessedAt: order.stockProcessedAt
      }
    }));

    res.status(200).json({
      success: true,
      data: {
        purchaseOrders: enrichedPurchaseOrders,
        customerConnectOrders: enrichedCCOrders,
        pagination: {
          purchaseOrders: {
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            limit: parseInt(limit)
          },
          customerConnectOrders: {
            total: ccTotal,
            page: parseInt(page),
            pages: Math.ceil(ccTotal / parseInt(limit)),
            limit: parseInt(limit)
          }
        }
      }
    });
  } catch (error) {
    console.error('Get purchase orders error:', error);
    next(error);
  }
};

/**
 * Get single purchase order
 * @route GET /api/warehouse/purchase-orders/:id
 * @access Authenticated
 */
const getPurchaseOrder = async (req, res, next) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName');

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Purchase order not found',
          code: 'PURCHASE_ORDER_NOT_FOUND'
        }
      });
    }

    
    const enrichedOrder = {
      ...purchaseOrder.toObject(),
      syncMetadata: {
        source: purchaseOrder.source || 'manual',
        lastSynced: purchaseOrder.lastSyncedAt || purchaseOrder.updatedAt,
        stockProcessed: purchaseOrder.stockProcessed || false,
        stockProcessedAt: purchaseOrder.stockProcessedAt || null
      }
    };

    res.status(200).json({
      success: true,
      data: { purchaseOrder: enrichedOrder }
    });
  } catch (error) {
    console.error('Get purchase order error:', error);
    next(error);
  }
};

/**
 * Get all external invoices (including RouteStar invoices)
 * @route GET /api/warehouse/invoices
 * @access Authenticated
 */
const getExternalInvoices = async (req, res, next) => {
  try {
    const {
      source,
      status,
      customer,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'invoiceDate',
      sortOrder = 'desc',
      includeSync = 'true'
    } = req.query;

    const query = {};

    if (source) query.source = source;
    if (status) query.status = status;
    if (customer) query['customer.name'] = { $regex: customer, $options: 'i' };

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await ExternalInvoice.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const invoices = await ExternalInvoice.find(query)
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    
    let routeStarInvoices = [];
    let rsTotal = 0;
    if (includeSync === 'true') {
      const rsQuery = {};
      if (status) {
        
        if (status === 'paid' || status === 'completed') {
          rsQuery.status = { $in: ['Completed', 'Closed'] };
        } else if (status === 'pending') {
          rsQuery.status = 'Pending';
        } else {
          rsQuery.status = status;
        }
      }
      if (customer) rsQuery['customer.name'] = { $regex: customer, $options: 'i' };
      if (startDate || endDate) {
        rsQuery.invoiceDate = {};
        if (startDate) rsQuery.invoiceDate.$gte = new Date(startDate);
        if (endDate) rsQuery.invoiceDate.$lte = new Date(endDate);
      }

      rsTotal = await RouteStarInvoice.countDocuments(rsQuery);
      routeStarInvoices = await RouteStarInvoice.find(rsQuery)
        .populate('createdBy', 'username fullName')
        .populate('lastUpdatedBy', 'username fullName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));
    }

    
    const enrichedInvoices = invoices.map(invoice => ({
      ...invoice.toObject(),
      syncMetadata: {
        source: invoice.source || 'manual',
        lastSynced: invoice.lastSyncedAt || invoice.updatedAt,
        stockProcessed: invoice.stockProcessed || false,
        stockProcessedAt: invoice.stockProcessedAt || null
      }
    }));

    const enrichedRSInvoices = routeStarInvoices.map(invoice => ({
      ...invoice.toObject(),
      syncMetadata: {
        source: 'routestar',
        syncSource: invoice.syncSource,
        lastSynced: invoice.lastSyncedAt,
        stockProcessed: invoice.stockProcessed,
        stockProcessedAt: invoice.stockProcessedAt
      }
    }));

    res.status(200).json({
      success: true,
      data: {
        invoices: enrichedInvoices,
        routeStarInvoices: enrichedRSInvoices,
        pagination: {
          invoices: {
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            limit: parseInt(limit)
          },
          routeStarInvoices: {
            total: rsTotal,
            page: parseInt(page),
            pages: Math.ceil(rsTotal / parseInt(limit)),
            limit: parseInt(limit)
          }
        }
      }
    });
  } catch (error) {
    console.error('Get external invoices error:', error);
    next(error);
  }
};

/**
 * Get single external invoice
 * @route GET /api/warehouse/invoices/:id
 * @access Authenticated
 */
const getExternalInvoice = async (req, res, next) => {
  try {
    const invoice = await ExternalInvoice.findById(req.params.id)
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Invoice not found',
          code: 'INVOICE_NOT_FOUND'
        }
      });
    }

    
    const enrichedInvoice = {
      ...invoice.toObject(),
      syncMetadata: {
        source: invoice.source || 'manual',
        lastSynced: invoice.lastSyncedAt || invoice.updatedAt,
        stockProcessed: invoice.stockProcessed || false,
        stockProcessedAt: invoice.stockProcessedAt || null
      }
    };

    res.status(200).json({
      success: true,
      data: { invoice: enrichedInvoice }
    });
  } catch (error) {
    console.error('Get external invoice error:', error);
    next(error);
  }
};

/**
 * Get stock summary
 * @route GET /api/warehouse/stock
 * @access Authenticated
 */
const getStockSummary = async (req, res, next) => {
  try {
    const {
      sku,
      lowStock,
      page = 1,
      limit = 50,
      sortBy = 'sku',
      sortOrder = 'asc'
    } = req.query;

    const query = {};

    if (sku) query.sku = { $regex: sku, $options: 'i' };
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$availableQty', '$lowStockThreshold'] };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await StockSummary.countDocuments(query);

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const stockSummaries = await StockSummary.find(query)
      .populate('product')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        stockSummaries,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get stock summary error:', error);
    next(error);
  }
};

/**
 * Get stock movements for a SKU (including movements from sync sources)
 * @route GET /api/warehouse/stock/:sku/movements
 * @access Authenticated
 */
const getStockMovements = async (req, res, next) => {
  try {
    const { sku } = req.params;
    const {
      startDate,
      endDate,
      type,
      source,
      page = 1,
      limit = 50
    } = req.query;

    const query = { sku: sku.toUpperCase() };

    if (type) query.type = type;
    if (source) query.source = source;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await StockMovement.countDocuments(query);

    const movements = await StockMovement.find(query)
      .populate('createdBy', 'username fullName')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    
    const enrichedMovements = movements.map(movement => {
      const movementObj = movement.toObject();

      
      movementObj.syncMetadata = {
        source: movementObj.source || 'manual',
        refType: movementObj.refType,
        refId: movementObj.refId,
        timestamp: movementObj.timestamp
      };

      
      if (movementObj.refType === 'PURCHASE_ORDER' && movementObj.source) {
        movementObj.syncMetadata.syncSource = movementObj.source === 'customerconnect' ? 'CustomerConnect' : null;
      } else if (movementObj.refType === 'INVOICE' && movementObj.source) {
        movementObj.syncMetadata.syncSource = movementObj.source === 'routestar' ? 'RouteStar' : null;
      }

      return movementObj;
    });

    
    const stockSummary = await StockSummary.findOne({ sku: sku.toUpperCase() }).populate('product');

    
    const movementStats = await StockMovement.aggregate([
      { $match: { sku: sku.toUpperCase() } },
      {
        $group: {
          _id: {
            type: '$type',
            source: '$source',
            refType: '$refType'
          },
          totalQty: { $sum: '$qty' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.type',
          sources: {
            $push: {
              source: '$_id.source',
              refType: '$_id.refType',
              totalQty: '$totalQty',
              count: '$count'
            }
          },
          totalQty: { $sum: '$totalQty' },
          totalCount: { $sum: '$count' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        movements: enrichedMovements,
        stockSummary,
        movementStats,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get stock movements error:', error);
    next(error);
  }
};

/**
 * Create stock adjustment
 * @route POST /api/warehouse/stock/:sku/adjust
 * @access Admin only
 */
const createStockAdjustment = async (req, res, next) => {
  try {
    const { sku } = req.params;
    const { qty, reason } = req.body;

    if (!qty || !reason) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Quantity and reason are required',
          code: 'INVALID_INPUT'
        }
      });
    }

    const movement = await StockProcessor.createAdjustment(
      sku.toUpperCase(),
      parseFloat(qty),
      reason,
      req.user.id
    );

    const stockSummary = await StockSummary.findOne({ sku: sku.toUpperCase() }).populate('product');

    res.status(201).json({
      success: true,
      message: 'Stock adjustment created successfully',
      data: {
        movement: {
          ...movement.toObject(),
          syncMetadata: {
            source: 'manual',
            type: 'adjustment',
            createdBy: req.user.id
          }
        },
        stockSummary
      }
    });
  } catch (error) {
    console.error('Create stock adjustment error:', error);
    next(error);
  }
};

/**
 * Get sales summary/statistics (including RouteStar data)
 * @route GET /api/warehouse/sales/summary
 * @access Authenticated
 */
const getSalesSummary = async (req, res, next) => {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      includeSync = 'true'
    } = req.query;

    const start = new Date(startDate);
    const end = new Date(endDate);

    
    const externalStats = await ExternalInvoice.getSalesStats(start, end);

    
    let routeStarStats = null;
    if (includeSync === 'true') {
      routeStarStats = await RouteStarInvoice.getSalesStats(start, end);
    }

    
    const topItems = await StockMovement.aggregate([
      {
        $match: {
          type: 'OUT',
          refType: 'INVOICE',
          timestamp: {
            $gte: start,
            $lte: end
          }
        }
      },
      {
        $group: {
          _id: {
            sku: '$sku',
            source: '$source'
          },
          totalQty: { $sum: '$qty' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.sku',
          totalQty: { $sum: '$totalQty' },
          count: { $sum: '$count' },
          sources: {
            $push: {
              source: '$_id.source',
              qty: '$totalQty',
              count: '$count'
            }
          }
        }
      },
      { $sort: { totalQty: -1 } },
      { $limit: 10 }
    ]);

    
    for (const item of topItems) {
      const product = await Product.findOne({ sku: item._id });
      item.product = product;
    }

    
    const combinedStats = {
      totalSales: (externalStats.totalSales || 0) + (routeStarStats?.totalSales || 0),
      totalInvoices: (externalStats.totalInvoices || 0) + (routeStarStats?.totalInvoices || 0),
      averageInvoiceValue: routeStarStats
        ? ((externalStats.totalSales || 0) + (routeStarStats.totalSales || 0)) / ((externalStats.totalInvoices || 0) + (routeStarStats.totalInvoices || 0))
        : externalStats.averageInvoiceValue || 0,
      breakdown: {
        external: externalStats,
        routeStar: routeStarStats
      }
    };

    res.status(200).json({
      success: true,
      data: {
        stats: combinedStats,
        topItems,
        period: {
          startDate,
          endDate
        }
      }
    });
  } catch (error) {
    console.error('Get sales summary error:', error);
    next(error);
  }
};

/**
 * Get unmapped products that need SKU assignment
 * @route GET /api/warehouse/unmapped-products
 * @access Admin only
 */
const getUnmappedProducts = async (req, res, next) => {
  try {
    const unmappedProducts = await SKUMapper.getUnmappedItems();

    res.status(200).json({
      success: true,
      data: { unmappedProducts }
    });
  } catch (error) {
    console.error('Get unmapped products error:', error);
    next(error);
  }
};

/**
 * Map temporary SKU to real SKU
 * @route POST /api/warehouse/map-sku
 * @access Admin only
 */
const mapSKU = async (req, res, next) => {
  try {
    const { tempSKU, realSKU } = req.body;

    if (!tempSKU || !realSKU) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Temporary SKU and real SKU are required',
          code: 'INVALID_INPUT'
        }
      });
    }

    const product = await SKUMapper.manuallyMapSKU(tempSKU, realSKU, req.user.id);

    res.status(200).json({
      success: true,
      message: 'SKU mapped successfully',
      data: { product }
    });
  } catch (error) {
    console.error('Map SKU error:', error);
    next(error);
  }
};

/**
 * Get warehouse sync health status
 * @route GET /api/warehouse/sync/health
 * @access Authenticated
 */
const getSyncHealth = async (req, res, next) => {
  try {
    const now = new Date();
    const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
    const lastHour = new Date(now - 60 * 60 * 1000);

    
    const ccStats = {
      totalOrders: await CustomerConnectOrder.countDocuments(),
      recentOrders: await CustomerConnectOrder.countDocuments({
        lastSyncedAt: { $gte: last24Hours }
      }),
      lastHourOrders: await CustomerConnectOrder.countDocuments({
        lastSyncedAt: { $gte: lastHour }
      }),
      unprocessedOrders: await CustomerConnectOrder.countDocuments({
        stockProcessed: false,
        status: { $in: ['Complete', 'Processing', 'Shipped'] }
      }),
      processingErrors: await CustomerConnectOrder.countDocuments({
        stockProcessingError: { $exists: true, $ne: null }
      }),
      lastSync: await CustomerConnectOrder.findOne()
        .sort({ lastSyncedAt: -1 })
        .select('lastSyncedAt')
    };

    
    const rsStats = {
      totalInvoices: await RouteStarInvoice.countDocuments(),
      recentInvoices: await RouteStarInvoice.countDocuments({
        lastSyncedAt: { $gte: last24Hours }
      }),
      lastHourInvoices: await RouteStarInvoice.countDocuments({
        lastSyncedAt: { $gte: lastHour }
      }),
      unprocessedInvoices: await RouteStarInvoice.countDocuments({
        stockProcessed: false,
        isComplete: true,
        status: { $in: ['Completed', 'Closed'] }
      }),
      processingErrors: await RouteStarInvoice.countDocuments({
        stockProcessingError: { $exists: true, $ne: null }
      }),
      lastSync: await RouteStarInvoice.findOne()
        .sort({ lastSyncedAt: -1 })
        .select('lastSyncedAt syncSource')
    };

    
    const movementStats = await StockMovement.aggregate([
      {
        $match: {
          timestamp: { $gte: last24Hours }
        }
      },
      {
        $group: {
          _id: {
            source: '$source',
            type: '$type'
          },
          count: { $sum: 1 },
          totalQty: { $sum: '$qty' }
        }
      }
    ]);

    
    const calculateHealthScore = () => {
      let score = 100;

      
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
      if (ccStats.lastSync?.lastSyncedAt < twoHoursAgo) score -= 20;
      if (rsStats.lastSync?.lastSyncedAt < twoHoursAgo) score -= 20;

      
      if (ccStats.unprocessedOrders > 10) score -= 15;
      if (rsStats.unprocessedInvoices > 10) score -= 15;

      
      if (ccStats.processingErrors > 0) score -= 15;
      if (rsStats.processingErrors > 0) score -= 15;

      return Math.max(0, score);
    };

    const healthScore = calculateHealthScore();
    const healthStatus = healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'unhealthy';

    res.status(200).json({
      success: true,
      data: {
        healthScore,
        healthStatus,
        timestamp: now,
        customerConnect: ccStats,
        routeStar: rsStats,
        stockMovements: {
          last24Hours: movementStats
        },
        recommendations: [
          ...(ccStats.unprocessedOrders > 10 ? ['Process pending CustomerConnect orders'] : []),
          ...(rsStats.unprocessedInvoices > 10 ? ['Process pending RouteStar invoices'] : []),
          ...(ccStats.processingErrors > 0 ? ['Review CustomerConnect processing errors'] : []),
          ...(rsStats.processingErrors > 0 ? ['Review RouteStar processing errors'] : []),
          ...(ccStats.lastSync?.lastSyncedAt < new Date(now - 2 * 60 * 60 * 1000)
            ? ['CustomerConnect sync may be delayed'] : []),
          ...(rsStats.lastSync?.lastSyncedAt < new Date(now - 2 * 60 * 60 * 1000)
            ? ['RouteStar sync may be delayed'] : [])
        ]
      }
    });
  } catch (error) {
    console.error('Get sync health error:', error);
    next(error);
  }
};

/**
 * Get sync statistics for a date range
 * @route GET /api/warehouse/sync/stats
 * @access Authenticated
 */
const getSyncStats = async (req, res, next) => {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = req.query;

    const start = new Date(startDate);
    const end = new Date(endDate);

    
    const ccOrderStats = await CustomerConnectOrder.aggregate([
      {
        $match: {
          orderDate: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            status: '$status',
            stockProcessed: '$stockProcessed'
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' }
        }
      }
    ]);

    const ccPurchaseStats = await CustomerConnectOrder.getPurchaseStats(start, end);
    const ccTopVendors = await CustomerConnectOrder.getTopVendors(start, end, 5);

    
    const rsInvoiceStats = await RouteStarInvoice.aggregate([
      {
        $match: {
          invoiceDate: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            status: '$status',
            stockProcessed: '$stockProcessed',
            syncSource: '$syncSource'
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' }
        }
      }
    ]);

    const rsSalesStats = await RouteStarInvoice.getSalesStats(start, end);
    const rsTopCustomers = await RouteStarInvoice.getTopCustomers(start, end, 5);

    
    const stockMovementsBySyncSource = await StockMovement.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            source: '$source',
            type: '$type',
            refType: '$refType'
          },
          count: { $sum: 1 },
          totalQty: { $sum: '$qty' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        customerConnect: {
          orderStats: ccOrderStats,
          purchaseStats: ccPurchaseStats,
          topVendors: ccTopVendors
        },
        routeStar: {
          invoiceStats: rsInvoiceStats,
          salesStats: rsSalesStats,
          topCustomers: rsTopCustomers
        },
        stockMovements: {
          bySyncSource: stockMovementsBySyncSource
        }
      }
    });
  } catch (error) {
    console.error('Get sync stats error:', error);
    next(error);
  }
};

/**
 * Get unprocessed sync items that need stock processing
 * @route GET /api/warehouse/sync/unprocessed
 * @access Authenticated
 */
const getUnprocessedSyncItems = async (req, res, next) => {
  try {
    const { limit = 50, source } = req.query;

    let unprocessedOrders = [];
    let unprocessedInvoices = [];

    if (!source || source === 'customerconnect') {
      unprocessedOrders = await CustomerConnectOrder.getUnprocessedOrders()
        .limit(parseInt(limit));
    }

    if (!source || source === 'routestar') {
      unprocessedInvoices = await RouteStarInvoice.getUnprocessedInvoices()
        .limit(parseInt(limit));
    }

    
    const enrichedOrders = unprocessedOrders.map(order => ({
      ...order.toObject(),
      syncMetadata: {
        source: 'customerconnect',
        type: 'purchase_order',
        itemCount: order.items?.length || 0,
        shouldProcess: order.shouldProcessStock
      }
    }));

    const enrichedInvoices = unprocessedInvoices.map(invoice => ({
      ...invoice.toObject(),
      syncMetadata: {
        source: 'routestar',
        type: 'invoice',
        itemCount: invoice.lineItems?.length || 0,
        shouldProcess: invoice.shouldProcessStock
      }
    }));

    res.status(200).json({
      success: true,
      data: {
        customerConnectOrders: enrichedOrders,
        routeStarInvoices: enrichedInvoices,
        summary: {
          totalUnprocessedOrders: enrichedOrders.length,
          totalUnprocessedInvoices: enrichedInvoices.length,
          total: enrichedOrders.length + enrichedInvoices.length
        }
      }
    });
  } catch (error) {
    console.error('Get unprocessed sync items error:', error);
    next(error);
  }
};

/**
 * Retry failed stock processing for sync items
 * @route POST /api/warehouse/sync/retry-processing
 * @access Admin only
 */
const retrySyncProcessing = async (req, res, next) => {
  try {
    const { source, id } = req.body;

    if (!source || !id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Source and ID are required',
          code: 'INVALID_INPUT'
        }
      });
    }

    let result = null;
    let itemType = '';

    if (source === 'customerconnect') {
      const order = await CustomerConnectOrder.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'CustomerConnect order not found',
            code: 'ORDER_NOT_FOUND'
          }
        });
      }

      
      order.stockProcessed = false;
      order.stockProcessingError = null;
      await order.save();

      result = order;
      itemType = 'CustomerConnect Order';
    } else if (source === 'routestar') {
      const invoice = await RouteStarInvoice.findById(id);
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'RouteStar invoice not found',
            code: 'INVOICE_NOT_FOUND'
          }
        });
      }

      
      invoice.stockProcessed = false;
      invoice.stockProcessingError = null;
      await invoice.save();

      result = invoice;
      itemType = 'RouteStar Invoice';
    } else {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid source. Must be "customerconnect" or "routestar"',
          code: 'INVALID_SOURCE'
        }
      });
    }

    res.status(200).json({
      success: true,
      message: `${itemType} marked for reprocessing`,
      data: {
        item: result,
        syncMetadata: {
          source,
          resetAt: new Date(),
          resetBy: req.user.id
        }
      }
    });
  } catch (error) {
    console.error('Retry sync processing error:', error);
    next(error);
  }
};

module.exports = {
  getPurchaseOrders,
  getPurchaseOrder,
  getExternalInvoices,
  getExternalInvoice,
  getStockSummary,
  getStockMovements,
  createStockAdjustment,
  getSalesSummary,
  getUnmappedProducts,
  mapSKU,
  getSyncHealth,
  getSyncStats,
  getUnprocessedSyncItems,
  retrySyncProcessing
};
