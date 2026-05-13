const StockDiscrepancy = require('../models/StockDiscrepancy');
const TruckDiscrepancy = require('../models/TruckDiscrepancy');
const StockSummary = require('../models/StockSummary');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
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

    // Also fetch TruckDiscrepancy records
    const truckMatchQuery = {};
    if (status) truckMatchQuery.status = status;
    if (type) truckMatchQuery.discrepancyType = type;
    if (startDate || endDate) {
      truckMatchQuery.reportedAt = {};
      if (startDate) truckMatchQuery.reportedAt.$gte = new Date(startDate);
      if (endDate) truckMatchQuery.reportedAt.$lte = new Date(endDate);
    }
    const truckDiscrepancies = await TruckDiscrepancy.find(truckMatchQuery)
      .sort({ reportedAt: -1 })
      .populate('reportedBy', 'username fullName')
      .populate('resolvedBy', 'username fullName')
      .lean();

    // Normalize truck discrepancies to match stock discrepancy shape
    const normalizedTruckDiscrepancies = truckDiscrepancies.map(td => ({
      ...td,
      _discrepancySource: 'truck',
      invoiceNumber: `TRUCK-${td.truckNumber}-${td.employeeName}`,
      invoiceType: 'TruckCheckout',
      itemSku: td.itemSku || '',
      categoryName: td.categoryName || td.itemName,
      systemQuantity: td.systemTruckInventory,
      actualQuantity: td.actualTruckInventory,
      notes: td.notes || `Truck ${td.truckNumber} - ${td.employeeName}`,
    }));

    const stockDiscrepancies = (result[0]?.data || []).map(d => ({ ...d, _discrepancySource: 'stock' }));
    const allDiscrepancies = [...stockDiscrepancies, ...normalizedTruckDiscrepancies]
      .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));

    // Paginate the combined list
    const totalCombined = (result[0]?.metadata[0]?.total || 0) + truckDiscrepancies.length;
    const paginatedDiscrepancies = allDiscrepancies.slice(skip, skip + limitNum);

    console.timeEnd('[Discrepancies] Query time');
    const response = {
      success: true,
      data: {
        discrepancies: paginatedDiscrepancies,
        pagination: {
          total: totalCombined,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCombined / limitNum)
        }
      }
    };
    if (shouldIncludeSummary) {
      // Merge summaries from both sources
      const stockByStatus = result[0]?.summaryByStatus || [];
      const truckByStatus = truckDiscrepancies.reduce((acc, td) => {
        const existing = acc.find(s => s._id === td.status);
        if (existing) {
          existing.count++;
          existing.totalDifference += td.difference || 0;
        } else {
          acc.push({ _id: td.status, count: 1, totalDifference: td.difference || 0 });
        }
        return acc;
      }, []);
      const mergedByStatus = [...stockByStatus];
      truckByStatus.forEach(ts => {
        const existing = mergedByStatus.find(s => s._id === ts._id);
        if (existing) {
          existing.count += ts.count;
          existing.totalDifference += ts.totalDifference;
        } else {
          mergedByStatus.push(ts);
        }
      });
      response.data.summary = {
        byStatus: mergedByStatus,
        byType: result[0]?.summaryByType || [],
        total: totalCombined
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

    // Also count truck discrepancies
    const truckQuery = {};
    if (startDate || endDate) {
      truckQuery.reportedAt = {};
      if (startDate) truckQuery.reportedAt.$gte = new Date(startDate);
      if (endDate) truckQuery.reportedAt.$lte = new Date(endDate);
    }
    const truckDiscrepancies = await TruckDiscrepancy.find(truckQuery).lean();
    const truckPending = truckDiscrepancies.filter(d => d.status === 'Pending').length;
    const truckApproved = truckDiscrepancies.filter(d => d.status === 'Approved').length;
    const truckRejected = truckDiscrepancies.filter(d => d.status === 'Rejected').length;

    // Merge counts
    summary.total = (summary.total || 0) + truckDiscrepancies.length;
    summary.pending = (summary.pending || 0) + truckPending;
    summary.approved = (summary.approved || 0) + truckApproved;
    summary.rejected = (summary.rejected || 0) + truckRejected;
    if (summary.byStatus) {
      const mergeStatus = (statusName, count) => {
        const existing = summary.byStatus.find(s => s._id === statusName);
        if (existing) {
          existing.count += count;
        } else if (count > 0) {
          summary.byStatus.push({ _id: statusName, count });
        }
      };
      mergeStatus('Pending', truckPending);
      mergeStatus('Approved', truckApproved);
      mergeStatus('Rejected', truckRejected);
    }

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
      reportedBy: req.user.id,
      status: 'Approved'
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

    // Try StockDiscrepancy first
    const discrepancy = await StockDiscrepancy.findById(id);
    if (discrepancy) {
      await discrepancy.approve(req.user.id, notes);
      await discrepancy.populate(['reportedBy', 'resolvedBy'], 'username fullName');
      return res.status(200).json({
        success: true,
        data: discrepancy,
        message: 'Discrepancy approved successfully'
      });
    }

    // Try TruckDiscrepancy
    const truckDiscrepancy = await TruckDiscrepancy.findById(id);
    if (truckDiscrepancy) {
      truckDiscrepancy.status = 'Approved';
      truckDiscrepancy.resolvedBy = req.user.id;
      truckDiscrepancy.resolvedAt = new Date();
      await truckDiscrepancy.save();
      await truckDiscrepancy.populate('reportedBy', 'username fullName');
      await truckDiscrepancy.populate('resolvedBy', 'username fullName');
      return res.status(200).json({
        success: true,
        data: truckDiscrepancy,
        message: 'Truck discrepancy approved successfully'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Discrepancy not found'
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

    // Try StockDiscrepancy first
    const discrepancy = await StockDiscrepancy.findById(id);
    if (discrepancy) {
      await discrepancy.reject(req.user.id, notes);
      await discrepancy.populate(['reportedBy', 'resolvedBy'], 'username fullName');
      return res.status(200).json({
        success: true,
        data: discrepancy,
        message: 'Discrepancy rejected successfully'
      });
    }

    // Try TruckDiscrepancy
    const truckDiscrepancy = await TruckDiscrepancy.findById(id);
    if (truckDiscrepancy) {
      truckDiscrepancy.status = 'Rejected';
      truckDiscrepancy.resolvedBy = req.user.id;
      truckDiscrepancy.resolvedAt = new Date();
      await truckDiscrepancy.save();
      await truckDiscrepancy.populate('reportedBy', 'username fullName');
      await truckDiscrepancy.populate('resolvedBy', 'username fullName');
      return res.status(200).json({
        success: true,
        data: truckDiscrepancy,
        message: 'Truck discrepancy rejected successfully'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Discrepancy not found'
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

    // Try StockDiscrepancy first
    const discrepancy = await StockDiscrepancy.findById(id);
    if (discrepancy) {
      // Revert stock adjustment if this was an approved discrepancy
      if (discrepancy.status === 'Approved' && discrepancy.difference !== 0) {
        const canonicalName = await RouteStarItemAlias.getCanonicalName(discrepancy.itemName);
        const sku = (canonicalName || discrepancy.categoryName || discrepancy.itemName).toUpperCase();
        const stockSummary = await StockSummary.findOne({ sku });
        if (stockSummary) {
          const diff = discrepancy.difference;
          if (diff > 0) {
            stockSummary.removeStock(diff);
          } else {
            stockSummary.addStock(Math.abs(diff));
          }
          await stockSummary.save();
          console.log(`   ✓ Reverted stock adjustment for ${sku}: ${diff > 0 ? '-' : '+'}${Math.abs(diff)}`);
        }
      }

      // If this is a truck checkout discrepancy, also delete the linked TruckDiscrepancy
      if (discrepancy.invoiceNumber && discrepancy.invoiceNumber.startsWith('CHECKOUT-')) {
        const checkoutId = discrepancy.invoiceNumber.replace('CHECKOUT-', '');
        const deletedTruck = await TruckDiscrepancy.deleteMany({ checkoutId });
        if (deletedTruck.deletedCount > 0) {
          console.log(`   ✓ Also deleted ${deletedTruck.deletedCount} linked TruckDiscrepancy record(s)`);
        }
      }

      await discrepancy.deleteOne();
      return res.status(200).json({
        success: true,
        message: 'Discrepancy deleted successfully'
      });
    }

    // Try TruckDiscrepancy if not found in StockDiscrepancy
    const truckDiscrepancy = await TruckDiscrepancy.findById(id);
    if (truckDiscrepancy) {
      await truckDiscrepancy.deleteOne();
      return res.status(200).json({
        success: true,
        message: 'Truck discrepancy deleted successfully'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Discrepancy not found'
    });
  } catch (error) {
    console.error('Delete discrepancy error:', error);
    next(error);
  }
};
