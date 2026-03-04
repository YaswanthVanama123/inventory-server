const StockDiscrepancy = require('../models/StockDiscrepancy');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');


exports.getDiscrepancies = async (req, res, next) => {
  try {
    const {
      status,
      type,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      includeSummary = 'true'  
    } = req.query;

    console.time('[Discrepancies] Query time');

    
    const matchQuery = {};

    if (status) {
      matchQuery.status = status;
    }

    if (type) {
      matchQuery.discrepancyType = type;
    }

    if (startDate || endDate) {
      matchQuery.reportedAt = {};
      if (startDate) matchQuery.reportedAt.$gte = new Date(startDate);
      if (endDate) matchQuery.reportedAt.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const shouldIncludeSummary = includeSummary === 'true';

    
    const facetStages = {
      metadata: [
        { $count: 'total' }
      ],
      data: [
        { $skip: skip },
        { $limit: limitNum },
        
        {
          $lookup: {
            from: 'users',
            localField: 'reportedBy',
            foreignField: '_id',
            pipeline: [
              { $project: { username: 1, fullName: 1 } }
            ],
            as: 'reportedBy'
          }
        },
        {
          $unwind: {
            path: '$reportedBy',
            preserveNullAndEmptyArrays: true
          }
        },
        
        {
          $lookup: {
            from: 'users',
            localField: 'resolvedBy',
            foreignField: '_id',
            pipeline: [
              { $project: { username: 1, fullName: 1 } }
            ],
            as: 'resolvedBy'
          }
        },
        {
          $unwind: {
            path: '$resolvedBy',
            preserveNullAndEmptyArrays: true
          }
        }
      ]
    };

    
    if (shouldIncludeSummary) {
      facetStages.summaryByStatus = [
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalDifference: { $sum: '$difference' }
          }
        }
      ];
      facetStages.summaryByType = [
        {
          $group: {
            _id: '$discrepancyType',
            count: { $sum: 1 },
            totalDifference: { $sum: '$difference' }
          }
        }
      ];
    }

    
    const result = await StockDiscrepancy.aggregate([
      
      { $match: matchQuery },

      
      { $sort: { reportedAt: -1 } },

      
      { $facet: facetStages }
    ]);

    const total = result[0]?.metadata[0]?.total || 0;
    const discrepancies = result[0]?.data || [];

    console.timeEnd('[Discrepancies] Query time');

    
    const response = {
      success: true,
      data: {
        discrepancies,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    };

    
    if (shouldIncludeSummary) {
      response.data.summary = {
        byStatus: result[0]?.summaryByStatus || [],
        byType: result[0]?.summaryByType || [],
        total
      };
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Get discrepancies error:', error);
    next(error);
  }
};


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


exports.getDiscrepancyById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const discrepancy = await StockDiscrepancy.findById(id)
      .populate('reportedBy', 'username fullName')
      .populate('resolvedBy', 'username fullName');

    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Discrepancy not found'
      });
    }

    res.status(200).json({
      success: true,
      data: discrepancy
    });
  } catch (error) {
    console.error('Get discrepancy by ID error:', error);
    next(error);
  }
};


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

    
    if (!itemName || systemQuantity === undefined || actualQuantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: itemName, systemQuantity, and actualQuantity are required'
      });
    }

    
    const discrepancyData = {
      invoiceNumber: invoiceNumber || 'N/A',
      invoiceType: invoiceType || 'RouteStarInvoice',
      itemName,
      itemSku,
      categoryName: categoryName || itemName,  
      systemQuantity,
      actualQuantity,
      discrepancyType,
      reason,
      notes,
      reportedBy: req.user.id  
    };

    
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
