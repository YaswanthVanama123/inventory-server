const Inventory = require('../models/Inventory');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const AuditLog = require('../models/AuditLog');
const SyncLog = require('../models/SyncLog');


const getDashboard = async (req, res, next) => {
  try {
    const startTime = Date.now();

    
    const [
      inventoryStats,
      categoryStats,
      recentActivity,
      salesData,
      syncStats
    ] = await Promise.all([
      
      Inventory.aggregate([
        { $match: { isActive: true, isDeleted: false } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalItems: { $sum: 1 },
                  totalValue: { $sum: { $multiply: ['$pricing.sellingPrice', '$quantity.current'] } },
                  lowStockCount: {
                    $sum: {
                      $cond: [
                        { $lte: ['$quantity.current', '$quantity.minimum'] },
                        1,
                        0
                      ]
                    }
                  },
                  reorderCount: {
                    $sum: {
                      $cond: [
                        { $lte: ['$quantity.current', '$supplier.reorderPoint'] },
                        1,
                        0
                      ]
                    }
                  }
                }
              }
            ],
            categories: [
              { $group: { _id: '$category', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 }
            ]
          }
        }
      ]),

      
      Promise.resolve([]),

      
      AuditLog.find({ resource: 'INVENTORY' })
        .select('action resource resourceId details timestamp performedBy')
        .populate('performedBy', 'username fullName') 
        .sort({ timestamp: -1 })
        .limit(5) 
        .lean(), 

      
      RouteStarInvoice.aggregate([
        {
          $match: {
            status: { $ne: 'Cancelled' },
            invoiceDate: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: '$total' },
                  totalOrders: { $sum: 1 }
                }
              }
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            byMonth: [
              {
                $group: {
                  _id: {
                    month: { $month: '$invoiceDate' },
                    year: { $year: '$invoiceDate' }
                  },
                  revenue: { $sum: '$total' },
                  orders: { $sum: 1 }
                }
              },
              { $sort: { '_id.year': 1, '_id.month': 1 } }
            ],
            topItems: [
              { $unwind: '$lineItems' },
              {
                $group: {
                  _id: { sku: '$lineItems.sku', name: '$lineItems.name' },
                  totalRevenue: { $sum: '$lineItems.amount' },
                  totalQty: { $sum: '$lineItems.quantity' },
                  orderCount: { $sum: 1 }
                }
              },
              { $sort: { totalRevenue: -1 } },
              { $limit: 5 }
            ]
          }
        }
      ]),

      
      getSyncStatisticsOptimized()
    ]);

    
    const invStats = inventoryStats[0];
    const totals = invStats.totals[0] || {
      totalItems: 0,
      totalValue: 0,
      lowStockCount: 0,
      reorderCount: 0
    };
    const categories = invStats.categories || [];

    
    const salesInfo = salesData[0];
    const salesTotals = salesInfo.totals[0] || { totalRevenue: 0, totalOrders: 0 };
    const invoiceStatusStats = {};
    salesInfo.byStatus.forEach(s => {
      invoiceStatusStats[s._id] = s.count;
    });

    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const topSellingItemsArray = salesInfo.topItems.map(item => ({
      name: item._id.name || 'Unknown',
      sku: item._id.sku || '',
      totalRevenue: item.totalRevenue,
      totalQty: item.totalQty,
      orderCount: item.orderCount
    }));

    const topSellingItems = {
      labels: topSellingItemsArray.map(item => {
        const name = item.name || 'Unknown';
        return name.length > 12 ? name.substring(0, 12) + '...' : name;
      }),
      datasets: [{
        data: topSellingItemsArray.map(item => Math.round(item.totalRevenue))
      }]
    };

    const topSellingItemsDetailed = topSellingItemsArray.map(item => ({
      itemName: item.name,
      skuCode: item.sku,
      value: item.totalRevenue,
      quantity: item.totalQty,
      orderCount: item.orderCount
    }));

    
    const salesTrend = salesInfo.byMonth.map(m => ({
      month: monthNames[m._id.month - 1],
      revenue: m.revenue,
      profit: 0, 
      orders: m.orders
    }));

    
    const currentMonth = new Date().getMonth();
    const lastMonthData = salesTrend[salesTrend.length - 1] || { revenue: 0, orders: 0 };
    const prevMonthData = salesTrend[salesTrend.length - 2] || { revenue: 0, orders: 0 };

    const revenueChange = prevMonthData.revenue > 0
      ? (((lastMonthData.revenue - prevMonthData.revenue) / prevMonthData.revenue) * 100).toFixed(1)
      : 0;

    const ordersChange = prevMonthData.orders > 0
      ? (((lastMonthData.orders - prevMonthData.orders) / prevMonthData.orders) * 100).toFixed(1)
      : 0;

    const responseData = {
      success: true,
      data: {
        summary: {
          totalItems: totals.totalItems,
          totalValue: totals.totalValue,
          lowStockCount: totals.lowStockCount,
          reorderCount: totals.reorderCount,
          totalRevenue: salesTotals.totalRevenue,
          totalOrders: salesTotals.totalOrders,
          avgOrderValue: salesTotals.totalOrders > 0 ? salesTotals.totalRevenue / salesTotals.totalOrders : 0,
          totalProfit: 0, 
          profitMargin: "0.00", 
          revenueChange,
          ordersChange,
          lowStockChange: 0, 
          profitMarginChange: "0.0", 
          totalPurchaseAmount: 0, 
          totalPurchaseOrders: 0,
          avgPurchaseValue: 0,
          dataSource: 'automation'
        },
        categoryStats: categories,
        recentActivity, 
        topSellingItems,
        topSellingItemsDetailed,
        invoiceStatusStats,
        salesTrend,
        syncStatus: syncStats
      }
    };

    const elapsed = Date.now() - startTime;
    console.log(`Dashboard API completed in ${elapsed}ms`);

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Get dashboard error:', error);
    next(error);
  }
};


const getSyncStatisticsOptimized = async () => {
  try {
    const [latestSync, last24HoursCount, weekSuccessRate] = await Promise.all([
      SyncLog.findOne().sort({ startedAt: -1 }).select('startedAt status source recordsFound recordsInserted recordsUpdated recordsFailed duration').lean(),
      SyncLog.countDocuments({ startedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      SyncLog.aggregate([
        { $match: { startedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            successful: {
              $sum: {
                $cond: [{ $in: ['$status', ['SUCCESS', 'completed']] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    const weekStats = weekSuccessRate[0] || { total: 0, successful: 0 };
    const successRate = weekStats.total > 0 ? ((weekStats.successful / weekStats.total) * 100).toFixed(2) : 0;

    const isDataStale = last24HoursCount === 0;

    return {
      lastSync: latestSync ? {
        timestamp: latestSync.startedAt,
        status: latestSync.status,
        source: latestSync.source,
        recordsFound: latestSync.recordsFound || 0,
        recordsInserted: latestSync.recordsInserted || 0,
        recordsUpdated: latestSync.recordsUpdated || 0,
        recordsFailed: latestSync.recordsFailed || 0,
        duration: latestSync.duration
      } : null,
      last24Hours: {
        syncCount: last24HoursCount,
        successful: 0, 
        failed: 0,
        inProgress: 0
      },
      weeklyStats: {
        totalSyncs: weekStats.total,
        successRate: parseFloat(successRate),
        averageDuration: 0 
      },
      health: {
        status: isDataStale ? 'critical' : 'healthy',
        isDataStale,
        hoursSinceLastSync: null,
        pendingRecords: 0
      },
      warnings: isDataStale ? [{
        level: 'critical',
        message: 'No successful sync in the last 24 hours',
        action: 'Investigate sync service and external API connections'
      }] : []
    };
  } catch (error) {
    console.error('Error getting sync statistics:', error);
    return null;
  }
};

module.exports = {
  getDashboard
};
