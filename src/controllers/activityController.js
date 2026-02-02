const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

/**
 * Get all activities with filtering and pagination
 * @route GET /api/activities
 * @access Private/Admin
 */
exports.getAllActivities = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      employeeId,
      action,
      resource,
      startDate,
      endDate,
      search,
    } = req.query;

    // Build query
    const query = {};

    // Filter by employee
    if (employeeId) {
      query.performedBy = employeeId;
    }

    // Filter by action type
    if (action) {
      query.action = action;
    }

    // Filter by resource type
    if (resource) {
      query.resource = resource;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    // Search in details
    if (search) {
      query.$or = [
        { 'details.itemName': { $regex: search, $options: 'i' } },
        { 'details.skuCode': { $regex: search, $options: 'i' } },
        { 'details.username': { $regex: search, $options: 'i' } },
        { 'details.invoiceNumber': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AuditLog.countDocuments(query);

    const activities = await AuditLog.find(query)
      .populate('performedBy', 'username fullName email role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        activities,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch activities',
        code: 'FETCH_FAILED',
      },
    });
  }
};

/**
 * Get employee activity summary
 * @route GET /api/activities/summary/:employeeId
 * @access Private/Admin
 */
exports.getEmployeeSummary = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify employee exists
    const employee = await User.findOne({ _id: employeeId, isDeleted: false });
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Employee not found',
          code: 'EMPLOYEE_NOT_FOUND',
        },
      });
    }

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.timestamp = {};
      if (startDate) {
        dateFilter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.timestamp.$lte = new Date(endDate);
      }
    }

    // Get activity counts by action
    const activityCounts = await AuditLog.aggregate([
      {
        $match: {
          performedBy: employee._id,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get activity counts by resource
    const resourceCounts = await AuditLog.aggregate([
      {
        $match: {
          performedBy: employee._id,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: '$resource',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get recent activities
    const recentActivities = await AuditLog.find({
      performedBy: employeeId,
      ...dateFilter,
    })
      .sort({ timestamp: -1 })
      .limit(10)
      .populate('performedBy', 'username fullName');

    // Total activities
    const totalActivities = await AuditLog.countDocuments({
      performedBy: employeeId,
      ...dateFilter,
    });

    res.status(200).json({
      success: true,
      data: {
        employee: {
          id: employee._id,
          username: employee.username,
          fullName: employee.fullName,
          email: employee.email,
          role: employee.role,
        },
        summary: {
          totalActivities,
          byAction: activityCounts,
          byResource: resourceCounts,
        },
        recentActivities,
      },
    });
  } catch (error) {
    console.error('Error fetching employee summary:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch employee summary',
        code: 'FETCH_FAILED',
      },
    });
  }
};

/**
 * Get activity statistics for dashboard
 * @route GET /api/activities/stats
 * @access Private/Admin
 */
exports.getActivityStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.timestamp = {};
      if (startDate) {
        dateFilter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.timestamp.$lte = new Date(endDate);
      }
    }

    // Get most active employees
    const mostActiveEmployees = await AuditLog.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$performedBy',
          activityCount: { $sum: 1 },
        },
      },
      { $sort: { activityCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          userId: '$_id',
          username: '$user.username',
          fullName: '$user.fullName',
          activityCount: 1,
        },
      },
    ]);

    // Get activity breakdown by action
    const actionBreakdown = await AuditLog.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Get activity breakdown by resource
    const resourceBreakdown = await AuditLog.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$resource',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Get daily activity trend (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyTrend = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Total activities
    const totalActivities = await AuditLog.countDocuments(dateFilter);

    res.status(200).json({
      success: true,
      data: {
        totalActivities,
        mostActiveEmployees,
        actionBreakdown,
        resourceBreakdown,
        dailyTrend,
      },
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch activity statistics',
        code: 'FETCH_FAILED',
      },
    });
  }
};

/**
 * Get sales activities (invoices created by employees)
 * @route GET /api/activities/sales
 * @access Private/Admin
 */
exports.getSalesActivities = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, page = 1, limit = 20 } = req.query;

    // Build query
    const query = {
      action: 'CREATE',
      resource: 'INVOICE',
    };

    if (employeeId) {
      query.performedBy = employeeId;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AuditLog.countDocuments(query);

    const salesActivities = await AuditLog.find(query)
      .populate('performedBy', 'username fullName')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        sales: salesActivities,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching sales activities:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch sales activities',
        code: 'FETCH_FAILED',
      },
    });
  }
};

/**
 * Get stock activities (inventory additions/reductions)
 * @route GET /api/activities/stock
 * @access Private/Admin
 */
exports.getStockActivities = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, page = 1, limit = 20 } = req.query;

    // Build query
    const query = {
      action: { $in: ['STOCK_ADD', 'STOCK_REDUCE', 'STOCK_ADJUST', 'CREATE', 'UPDATE'] },
      resource: 'INVENTORY',
    };

    if (employeeId) {
      query.performedBy = employeeId;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AuditLog.countDocuments(query);

    const stockActivities = await AuditLog.find(query)
      .populate('performedBy', 'username fullName')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        activities: stockActivities,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching stock activities:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch stock activities',
        code: 'FETCH_FAILED',
      },
    });
  }
};

/**
 * Get delete activities (items deleted by employees)
 * @route GET /api/activities/deletions
 * @access Private/Admin
 */
exports.getDeleteActivities = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, page = 1, limit = 20 } = req.query;

    // Build query
    const query = {
      action: 'DELETE',
    };

    if (employeeId) {
      query.performedBy = employeeId;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AuditLog.countDocuments(query);

    const deleteActivities = await AuditLog.find(query)
      .populate('performedBy', 'username fullName')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        deletions: deleteActivities,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching delete activities:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch delete activities',
        code: 'FETCH_FAILED',
      },
    });
  }
};
