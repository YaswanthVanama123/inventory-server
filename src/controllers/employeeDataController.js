const employeeDataService = require('../services/employeeData.service');
const User = require('../models/User');


const getMyWorkData = async (req, res) => {
  try {
    
    const user = await User.findById(req.user.id).select('truckNumber');

    if (!user || !user.truckNumber) {
      return res.status(400).json({
        success: false,
        message: 'No truck number assigned to your account. Please contact your administrator.'
      });
    }

    const {
      page = 1,
      limit = 50,
      status,
      invoiceType,
      startDate,
      endDate,
      sortBy = 'invoiceDate',
      sortOrder = 'desc'
    } = req.query;

    const result = await employeeDataService.getEmployeeInvoices(
      user.truckNumber,
      { page, limit, status, invoiceType, startDate, endDate, sortBy, sortOrder }
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get my work data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch work data',
      error: error.message
    });
  }
};


const getMyStatistics = async (req, res) => {
  try {
    
    const user = await User.findById(req.user.id).select('truckNumber');

    if (!user || !user.truckNumber) {
      return res.status(400).json({
        success: false,
        message: 'No truck number assigned to your account'
      });
    }

    const { startDate, endDate } = req.query;

    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = await employeeDataService.getEmployeeStatistics(
      user.truckNumber,
      start,
      end
    );

    res.json({
      success: true,
      data: {
        ...stats,
        dateRange: { start, end }
      }
    });
  } catch (error) {
    console.error('Get my statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};


const getMyRecentActivity = async (req, res) => {
  try {
    
    const user = await User.findById(req.user.id).select('truckNumber');

    if (!user || !user.truckNumber) {
      return res.status(400).json({
        success: false,
        message: 'No truck number assigned to your account'
      });
    }

    const { limit = 10 } = req.query;

    const recentActivity = await employeeDataService.getEmployeeRecentActivity(
      user.truckNumber,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: recentActivity
    });
  } catch (error) {
    console.error('Get my recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity',
      error: error.message
    });
  }
};


const getMyPerformance = async (req, res) => {
  try {
    
    const user = await User.findById(req.user.id).select('truckNumber');

    if (!user || !user.truckNumber) {
      return res.status(400).json({
        success: false,
        message: 'No truck number assigned to your account'
      });
    }

    const { startDate, endDate } = req.query;

    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const performance = await employeeDataService.getEmployeePerformance(
      user.truckNumber,
      start,
      end
    );

    res.json({
      success: true,
      data: {
        ...performance,
        dateRange: { start, end }
      }
    });
  } catch (error) {
    console.error('Get my performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance data',
      error: error.message
    });
  }
};


const getEmployeeDataByTruckNumber = async (req, res) => {
  try {
    const { truckNumber } = req.params;
    const {
      page = 1,
      limit = 50,
      status,
      invoiceType,
      startDate,
      endDate
    } = req.query;

    const result = await employeeDataService.getEmployeeInvoices(
      truckNumber,
      { page, limit, status, invoiceType, startDate, endDate }
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get employee data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee data',
      error: error.message
    });
  }
};


const getAllTruckAssignments = async (req, res) => {
  try {
    const assignments = await employeeDataService.getAllTruckAssignments();

    res.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    console.error('Get truck assignments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch truck assignments',
      error: error.message
    });
  }
};

module.exports = {
  getMyWorkData,
  getMyStatistics,
  getMyRecentActivity,
  getMyPerformance,
  getEmployeeDataByTruckNumber,
  getAllTruckAssignments
};
