const StockDiscrepancy = require('../models/StockDiscrepancy');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');

// Get all discrepancies with filters
exports.getDiscrepancies = async (req, res, next) => {
  try {
    const {
      status,
      type,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (type) {
      query.discrepancyType = type;
    }

    if (startDate || endDate) {
      query.reportedAt = {};
      if (startDate) query.reportedAt.$gte = new Date(startDate);
      if (endDate) query.reportedAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [discrepancies, total] = await Promise.all([
      StockDiscrepancy.find(query)
        .populate('reportedBy', 'username fullName')
        .populate('resolvedBy', 'username fullName')
        .sort({ reportedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      StockDiscrepancy.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        discrepancies,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get discrepancies error:', error);
    next(error);
  }
};

// Get discrepancy summary
exports.getDiscrepancySummary = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const summary = await StockDiscrepancy.getSummary(startDate, endDate);

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get discrepancy summary error:', error);
    next(error);
  }
};

// Create new discrepancy
exports.createDiscrepancy = async (req, res, next) => {
  try {
    const {
      invoiceNumber,
      invoiceId,
      invoiceType,
      itemName,
      itemSku,
      categoryName,
      systemQuantity,
      actualQuantity,
      discrepancyType,
      reason,
      notes
    } = req.body;

    // Validate required fields - invoiceNumber is optional
    if (!itemName || systemQuantity === undefined || actualQuantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: itemName, systemQuantity, and actualQuantity are required'
      });
    }

    // Build discrepancy data object
    const discrepancyData = {
      invoiceNumber: invoiceNumber || 'N/A',
      invoiceType: invoiceType || 'RouteStarInvoice',
      itemName,
      itemSku,
      categoryName: categoryName || itemName,  // Use categoryName if provided, otherwise fall back to itemName
      systemQuantity,
      actualQuantity,
      discrepancyType,
      reason,
      notes,
      reportedBy: req.user.id  // Use req.user.id, not req.user._id
    };

    // Only include invoiceId if it has a value
    if (invoiceId && invoiceId.trim() !== '') {
      discrepancyData.invoiceId = invoiceId;
    }

    const discrepancy = await StockDiscrepancy.create(discrepancyData);

    await discrepancy.populate('reportedBy', 'username fullName');

    res.status(201).json({
      success: true,
      data: discrepancy
    });
  } catch (error) {
    console.error('Create discrepancy error:', error);
    next(error);
  }
};

// Update discrepancy
exports.updateDiscrepancy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      actualQuantity,
      discrepancyType,
      reason,
      notes
    } = req.body;

    const discrepancy = await StockDiscrepancy.findById(id);

    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Discrepancy not found'
      });
    }

    if (discrepancy.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Can only update pending discrepancies'
      });
    }

    if (actualQuantity !== undefined) discrepancy.actualQuantity = actualQuantity;
    if (discrepancyType) discrepancy.discrepancyType = discrepancyType;
    if (reason !== undefined) discrepancy.reason = reason;
    if (notes !== undefined) discrepancy.notes = notes;

    await discrepancy.save();
    await discrepancy.populate('reportedBy', 'username fullName');

    res.status(200).json({
      success: true,
      data: discrepancy
    });
  } catch (error) {
    console.error('Update discrepancy error:', error);
    next(error);
  }
};

// Approve discrepancy
exports.approveDiscrepancy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const discrepancy = await StockDiscrepancy.findById(id);

    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Discrepancy not found'
      });
    }

    await discrepancy.approve(req.user.id, notes);
    await discrepancy.populate(['reportedBy', 'resolvedBy'], 'username fullName');

    res.status(200).json({
      success: true,
      data: discrepancy,
      message: 'Discrepancy approved successfully'
    });
  } catch (error) {
    console.error('Approve discrepancy error:', error);
    next(error);
  }
};

// Reject discrepancy
exports.rejectDiscrepancy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const discrepancy = await StockDiscrepancy.findById(id);

    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Discrepancy not found'
      });
    }

    await discrepancy.reject(req.user.id, notes);
    await discrepancy.populate(['reportedBy', 'resolvedBy'], 'username fullName');

    res.status(200).json({
      success: true,
      data: discrepancy,
      message: 'Discrepancy rejected successfully'
    });
  } catch (error) {
    console.error('Reject discrepancy error:', error);
    next(error);
  }
};

// Bulk approve discrepancies
exports.bulkApproveDiscrepancies = async (req, res, next) => {
  try {
    const { discrepancyIds, notes } = req.body;

    if (!discrepancyIds || !Array.isArray(discrepancyIds)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid discrepancy IDs'
      });
    }

    const discrepancies = await StockDiscrepancy.find({
      _id: { $in: discrepancyIds },
      status: 'Pending'
    });

    const approved = [];
    for (const discrepancy of discrepancies) {
      await discrepancy.approve(req.user.id, notes);
      approved.push(discrepancy);
    }

    res.status(200).json({
      success: true,
      data: {
        approved: approved.length,
        discrepancies: approved
      },
      message: `${approved.length} discrepancies approved successfully`
    });
  } catch (error) {
    console.error('Bulk approve error:', error);
    next(error);
  }
};

// Delete discrepancy (allowing all statuses for testing)
exports.deleteDiscrepancy = async (req, res, next) => {
  try {
    const { id } = req.params;

    const discrepancy = await StockDiscrepancy.findById(id);

    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Discrepancy not found'
      });
    }

    // TODO: In production, uncomment this to only allow deleting pending discrepancies
    // if (discrepancy.status !== 'Pending') {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Can only delete pending discrepancies'
    //   });
    // }

    await discrepancy.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Discrepancy deleted successfully'
    });
  } catch (error) {
    console.error('Delete discrepancy error:', error);
    next(error);
  }
};
