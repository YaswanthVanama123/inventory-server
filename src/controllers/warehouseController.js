const PurchaseOrder = require('../models/PurchaseOrder');
const ExternalInvoice = require('../models/ExternalInvoice');
const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const Product = require('../models/Product');
const StockProcessor = require('../services/stockProcessor');
const SKUMapper = require('../services/skuMapper');

/**
 * Get all purchase orders
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
      sortOrder = 'desc'
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

    res.status(200).json({
      success: true,
      data: {
        purchaseOrders,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
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

    res.status(200).json({
      success: true,
      data: { purchaseOrder }
    });
  } catch (error) {
    console.error('Get purchase order error:', error);
    next(error);
  }
};

/**
 * Get all external invoices
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
      sortOrder = 'desc'
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

    res.status(200).json({
      success: true,
      data: {
        invoices,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
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

    res.status(200).json({
      success: true,
      data: { invoice }
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
 * Get stock movements for a SKU
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
      page = 1,
      limit = 50
    } = req.query;

    const query = { sku: sku.toUpperCase() };

    if (type) query.type = type;

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

    // Get current stock summary
    const stockSummary = await StockSummary.findOne({ sku: sku.toUpperCase() }).populate('product');

    res.status(200).json({
      success: true,
      data: {
        movements,
        stockSummary,
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
        movement,
        stockSummary
      }
    });
  } catch (error) {
    console.error('Create stock adjustment error:', error);
    next(error);
  }
};

/**
 * Get sales summary/statistics
 * @route GET /api/warehouse/sales/summary
 * @access Authenticated
 */
const getSalesSummary = async (req, res, next) => {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = req.query;

    const stats = await ExternalInvoice.getSalesStats(new Date(startDate), new Date(endDate));

    // Get top selling items
    const topItems = await StockMovement.aggregate([
      {
        $match: {
          type: 'OUT',
          refType: 'INVOICE',
          timestamp: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: '$sku',
          totalQty: { $sum: '$qty' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalQty: -1 } },
      { $limit: 10 }
    ]);

    // Populate product info
    for (const item of topItems) {
      const product = await Product.findOne({ sku: item._id });
      item.product = product;
    }

    res.status(200).json({
      success: true,
      data: {
        stats,
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
  mapSKU
};
