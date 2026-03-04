const AuditLog = require('../models/AuditLog');
const User = require('../models/User');


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

    
    const query = {};

    
    if (employeeId) {
      query.performedBy = employeeId;
    }

    
    if (action) {
      query.action = action;
    }

    
    if (resource) {
      query.resource = resource;
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


exports.getEmployeeSummary = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    
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

    
    const recentActivities = await AuditLog.find({
      performedBy: employeeId,
      ...dateFilter,
    })
      .sort({ timestamp: -1 })
      .limit(10)
      .populate('performedBy', 'username fullName');

    
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


exports.getActivityStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    
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


exports.getSalesActivities = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, page = 1, limit = 20 } = req.query;

    
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


exports.getStockActivities = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, page = 1, limit = 20 } = req.query;

    
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


exports.getDeleteActivities = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, page = 1, limit = 20 } = req.query;


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



exports.getPageData = async (req, res) => {
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

    
    const activityQuery = {};
    if (employeeId) activityQuery.performedBy = employeeId;
    if (action) activityQuery.action = action;
    if (resource) activityQuery.resource = resource;
    if (startDate || endDate) {
      activityQuery.timestamp = {};
      if (startDate) activityQuery.timestamp.$gte = new Date(startDate);
      if (endDate) activityQuery.timestamp.$lte = new Date(endDate);
    }
    if (search) {
      activityQuery.$or = [
        { 'details.itemName': { $regex: search, $options: 'i' } },
        { 'details.skuCode': { $regex: search, $options: 'i' } },
        { 'details.username': { $regex: search, $options: 'i' } },
        { 'details.invoiceNumber': { $regex: search, $options: 'i' } },
      ];
    }

    
    const statsDateFilter = {};
    if (startDate || endDate) {
      statsDateFilter.timestamp = {};
      if (startDate) statsDateFilter.timestamp.$gte = new Date(startDate);
      if (endDate) statsDateFilter.timestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    
    const [activities, total, users, stats] = await Promise.all([
      
      AuditLog.find(activityQuery)
        .populate('performedBy', 'username fullName email role')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      
      AuditLog.countDocuments(activityQuery),

      
      User.find({ isDeleted: false })
        .select('_id username fullName email role')
        .sort({ fullName: 1 })
        .lean(),

      
      (async () => {
        const [
          mostActiveEmployees,
          actionBreakdown,
          resourceBreakdown,
          dailyTrend,
          totalActivities
        ] = await Promise.all([
          
          AuditLog.aggregate([
            { $match: statsDateFilter },
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
          ]),

          
          AuditLog.aggregate([
            { $match: statsDateFilter },
            {
              $group: {
                _id: '$action',
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ]),

          
          AuditLog.aggregate([
            { $match: statsDateFilter },
            {
              $group: {
                _id: '$resource',
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ]),

          
          AuditLog.aggregate([
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
          ]),

          
          AuditLog.countDocuments(statsDateFilter),
        ]);

        return {
          totalActivities,
          mostActiveEmployees,
          actionBreakdown,
          resourceBreakdown,
          dailyTrend,
        };
      })(),
    ]);

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
        users,
        stats,
      },
    });
  } catch (error) {
    console.error('Error fetching page data:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch page data',
        code: 'FETCH_FAILED',
      },
    });
  }
};
