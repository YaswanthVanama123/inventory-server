const RouteStarInvoice = require('../models/RouteStarInvoice');
const User = require('../models/User');


class EmployeeDataService {
  
  async getEmployeeInvoices(truckNumber, options = {}) {
    const {
      page = 1,
      limit = 50,
      status,
      invoiceType,
      startDate,
      endDate,
      sortBy = 'invoiceDate',
      sortOrder = 'desc'
    } = options;

    
    const query = {
      'lineItems.class': truckNumber.toUpperCase()
    };

    if (status) {
      query.status = status;
    }

    if (invoiceType) {
      query.invoiceType = invoiceType;
    }

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [invoices, total] = await Promise.all([
      RouteStarInvoice.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      RouteStarInvoice.countDocuments(query)
    ]);

    return {
      invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  
  async getEmployeeStatistics(truckNumber, startDate, endDate) {
    const matchQuery = {
      'lineItems.class': truckNumber.toUpperCase(),
      invoiceDate: {
        $gte: startDate,
        $lte: endDate
      }
    };

    const stats = await RouteStarInvoice.aggregate([
      { $match: matchQuery },
      {
        $unwind: '$lineItems'
      },
      {
        $match: {
          'lineItems.class': truckNumber.toUpperCase()
        }
      },
      {
        $group: {
          _id: null,
          totalInvoices: { $addToSet: '$_id' },
          totalRevenue: { $sum: '$lineItems.amount' },
          totalItems: { $sum: '$lineItems.quantity' },
          avgInvoiceValue: { $avg: '$total' },
          completedInvoices: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0]
            }
          },
          pendingInvoices: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalInvoices: { $size: '$totalInvoices' },
          totalRevenue: { $round: ['$totalRevenue', 2] },
          totalItems: 1,
          avgInvoiceValue: { $round: ['$avgInvoiceValue', 2] },
          completedInvoices: 1,
          pendingInvoices: 1
        }
      }
    ]);

    return stats[0] || {
      totalInvoices: 0,
      totalRevenue: 0,
      totalItems: 0,
      avgInvoiceValue: 0,
      completedInvoices: 0,
      pendingInvoices: 0
    };
  }

  
  async getEmployeeRecentActivity(truckNumber, limit = 10) {
    const query = {
      'lineItems.class': truckNumber.toUpperCase()
    };

    const recentInvoices = await RouteStarInvoice.find(query)
      .sort({ invoiceDate: -1 })
      .limit(limit)
      .select('invoiceNumber invoiceDate status customer.name total lineItems')
      .lean();

    
    return recentInvoices.map(invoice => ({
      ...invoice,
      lineItems: invoice.lineItems.filter(
        item => item.class && item.class.toUpperCase() === truckNumber.toUpperCase()
      )
    }));
  }

  
  async getEmployeePerformance(truckNumber, startDate, endDate) {
    const matchQuery = {
      'lineItems.class': truckNumber.toUpperCase(),
      invoiceDate: {
        $gte: startDate,
        $lte: endDate
      }
    };

    
    const dailyRevenue = await RouteStarInvoice.aggregate([
      { $match: matchQuery },
      { $unwind: '$lineItems' },
      {
        $match: {
          'lineItems.class': truckNumber.toUpperCase()
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' }
          },
          revenue: { $sum: '$lineItems.amount' },
          invoiceCount: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          date: '$_id',
          revenue: { $round: ['$revenue', 2] },
          invoiceCount: { $size: '$invoiceCount' }
        }
      },
      { $sort: { date: 1 } }
    ]);

    
    const topItems = await RouteStarInvoice.aggregate([
      { $match: matchQuery },
      { $unwind: '$lineItems' },
      {
        $match: {
          'lineItems.class': truckNumber.toUpperCase()
        }
      },
      {
        $group: {
          _id: '$lineItems.name',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$lineItems.quantity' },
          totalRevenue: { $sum: '$lineItems.amount' }
        }
      },
      {
        $project: {
          itemName: '$_id',
          count: 1,
          totalQuantity: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    return {
      dailyRevenue,
      topItems
    };
  }

  
  async getEmployeeByTruckNumber(truckNumber) {
    return await User.findOne({
      truckNumber: truckNumber.toUpperCase(),
      isDeleted: false
    }).select('-password');
  }

  
  async getAllTruckAssignments() {
    return await User.find({
      truckNumber: { $exists: true, $ne: null, $ne: '' },
      isDeleted: false
    })
      .select('username fullName email truckNumber role isActive')
      .sort({ truckNumber: 1 })
      .lean();
  }
}

module.exports = new EmployeeDataService();
