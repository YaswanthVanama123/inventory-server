const Inventory = require('../models/Inventory');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Invoice = require('../models/Invoice');
const SyncLog = require('../models/SyncLog');
const StockMovement = require('../models/StockMovement');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const { getScheduler } = require('../services/scheduler');



const getSyncStatistics = async () => {
  try {
    
    const latestSync = await SyncLog.findOne().sort({ startedAt: -1 });

    
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSyncs = await SyncLog.find({
      startedAt: { $gte: last24Hours }
    }).sort({ startedAt: -1 });

    
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekSyncs = await SyncLog.find({
      startedAt: { $gte: last7Days }
    });

    
    const successfulSyncs = weekSyncs.filter(s => s.status === 'SUCCESS' || s.status === 'completed').length;
    const totalSyncs = weekSyncs.length;
    const successRate = totalSyncs > 0 ? ((successfulSyncs / totalSyncs) * 100).toFixed(2) : 0;

    
    const pendingRecords = await StockMovement.countDocuments({
      timestamp: { $gte: last24Hours }
    });

    
    const completedSyncs = weekSyncs.filter(s => (s.status === 'SUCCESS' || s.status === 'completed') && s.duration);
    const avgDuration = completedSyncs.length > 0
      ? (completedSyncs.reduce((sum, s) => sum + s.duration, 0) / completedSyncs.length).toFixed(2)
      : 0;

    
    const isDataStale = !recentSyncs.some(s => s.status === 'SUCCESS' || s.status === 'completed');
    const lastSuccessfulSync = weekSyncs.find(s => s.status === 'SUCCESS' || s.status === 'completed');
    const hoursSinceLastSync = lastSuccessfulSync
      ? ((Date.now() - new Date(lastSuccessfulSync.endedAt || lastSuccessfulSync.startedAt).getTime()) / (1000 * 60 * 60)).toFixed(1)
      : null;

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
        syncCount: recentSyncs.length,
        successful: recentSyncs.filter(s => s.status === 'SUCCESS' || s.status === 'completed').length,
        failed: recentSyncs.filter(s => s.status === 'FAILED').length,
        inProgress: recentSyncs.filter(s => s.status === 'IN_PROGRESS').length
      },
      weeklyStats: {
        totalSyncs,
        successRate: parseFloat(successRate),
        averageDuration: parseFloat(avgDuration)
      },
      health: {
        isDataStale,
        hoursSinceLastSync: hoursSinceLastSync ? parseFloat(hoursSinceLastSync) : null,
        pendingRecords,
        warnings: []
      }
    };
  } catch (error) {
    console.error('Error getting sync statistics:', error);
    return null;
  }
};


const generateSyncWarnings = (syncStats) => {
  const warnings = [];

  if (!syncStats) {
    warnings.push({
      level: 'error',
      message: 'Unable to retrieve sync statistics',
      action: 'Check sync service status'
    });
    return warnings;
  }

  
  if (syncStats.health.isDataStale) {
    warnings.push({
      level: 'critical',
      message: 'No successful sync in the last 24 hours',
      action: 'Investigate sync service and external API connections'
    });
  } else if (syncStats.health.hoursSinceLastSync > 6) {
    warnings.push({
      level: 'warning',
      message: `Last successful sync was ${syncStats.health.hoursSinceLastSync} hours ago`,
      action: 'Consider running a manual sync'
    });
  }

  
  if (syncStats.weeklyStats.successRate < 70) {
    warnings.push({
      level: 'critical',
      message: `Low sync success rate: ${syncStats.weeklyStats.successRate}%`,
      action: 'Review sync error logs and fix recurring issues'
    });
  } else if (syncStats.weeklyStats.successRate < 90) {
    warnings.push({
      level: 'warning',
      message: `Moderate sync success rate: ${syncStats.weeklyStats.successRate}%`,
      action: 'Monitor sync performance'
    });
  }

  
  if (syncStats.health.pendingRecords > 100) {
    warnings.push({
      level: 'warning',
      message: `${syncStats.health.pendingRecords} records pending synchronization`,
      action: 'Run a full sync to clear backlog'
    });
  }

  
  if (syncStats.last24Hours.failed > 5) {
    warnings.push({
      level: 'warning',
      message: `${syncStats.last24Hours.failed} sync failures in the last 24 hours`,
      action: 'Review error logs for patterns'
    });
  }

  
  if (syncStats.lastSync && syncStats.lastSync.status === 'FAILED') {
    warnings.push({
      level: 'error',
      message: 'Most recent sync attempt failed',
      action: 'Check logs and retry sync operation'
    });
  }

  return warnings;
};


const getDashboard = async (req, res, next) => {
  try {

    const totalItems = await Inventory.countDocuments({ isActive: true, isDeleted: false });


    const items = await Inventory.find({ isActive: true, isDeleted: false });
    const totalValue = items.reduce((sum, item) => {
      return sum + (item.pricing.sellingPrice * item.quantity.current);
    }, 0);


    const lowStockCount = items.filter(item => item.isLowStock).length;


    const reorderCount = items.filter(item => item.needsReorder).length;


    const categoryStats = await Inventory.aggregate([
      { $match: { isActive: true, isDeleted: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);


    const recentActivity = await AuditLog.find({ resource: 'INVENTORY' })
      .populate('performedBy', 'username fullName')
      .sort({ timestamp: -1 })
      .limit(10);


    const routeStarInvoices = await RouteStarInvoice.find({
      status: { $ne: 'Cancelled' },
      invoiceDate: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
    })
      .sort({ invoiceDate: 1 })
      .lean();

    
    const itemSalesMap = {};
    routeStarInvoices.forEach(invoice => {
      if (invoice.items && Array.isArray(invoice.items)) {
        invoice.items.forEach(item => {
          const key = item.sku || item.name;
          if (!itemSalesMap[key]) {
            itemSalesMap[key] = {
              sku: item.sku || '',
              name: item.name || 'Unknown',
              totalQty: 0,
              totalRevenue: 0,
              orderCount: 0
            };
          }
          itemSalesMap[key].totalQty += item.qty || 0;
          itemSalesMap[key].totalRevenue += (item.unitPrice || 0) * (item.qty || 0);
          itemSalesMap[key].orderCount += 1;
        });
      }
    });

    
    const topSellingItems = Object.values(itemSalesMap)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5)
      .map(item => ({
        itemName: item.name,
        skuCode: item.sku,
        value: item.totalRevenue,
        quantity: item.totalQty,
        orderCount: item.orderCount
      }));


    const customerConnectOrders = await CustomerConnectOrder.find({
      status: 'Complete',
      orderDate: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
    })
      .sort({ orderDate: 1 })
      .lean();

    console.log('=== DASHBOARD DEBUG (Automation Data) ===');
    console.log('Total RouteStar invoices found:', routeStarInvoices.length);
    console.log('Total CustomerConnect orders found:', customerConnectOrders.length);
    console.log('Sample RouteStar invoice:', routeStarInvoices.length > 0 ? {
      invoiceNumber: routeStarInvoices[0].invoiceNumber,
      total: routeStarInvoices[0].total,
      itemsCount: routeStarInvoices[0].items?.length || 0
    } : 'No invoices');


    const totalRevenue = routeStarInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalOrders = routeStarInvoices.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;


    const totalPurchaseAmount = customerConnectOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalPurchaseOrders = customerConnectOrders.length;
    const avgPurchaseValue = totalPurchaseOrders > 0 ? totalPurchaseAmount / totalPurchaseOrders : 0;

    console.log('Calculated totalRevenue (sales):', totalRevenue);
    console.log('Calculated totalOrders (sales):', totalOrders);
    console.log('Calculated totalPurchaseAmount:', totalPurchaseAmount);
    console.log('Calculated totalPurchaseOrders:', totalPurchaseOrders);


    let totalProfit = 0;
    let totalCost = 0;


    routeStarInvoices.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const itemRevenue = (item.unitPrice || 0) * (item.qty || 0);

          const matchingInventory = items.find(invItem =>
            invItem.skuCode === item.sku || invItem.itemName === item.name
          );

          if (matchingInventory && matchingInventory.pricing) {
            const itemCost = matchingInventory.pricing.purchasePrice * (item.qty || 0);
            totalCost += itemCost;
            totalProfit += itemRevenue - itemCost;
          }
        });
      }
    });


    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0;


    const salesByMonth = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    routeStarInvoices.forEach(invoice => {
      const date = new Date(invoice.invoiceDate);
      const monthKey = `${monthNames[date.getMonth()]}`;

      if (!salesByMonth[monthKey]) {
        salesByMonth[monthKey] = {
          month: monthKey,
          revenue: 0,
          profit: 0,
          orders: 0
        };
      }

      salesByMonth[monthKey].revenue += (invoice.total || 0);
      salesByMonth[monthKey].orders += 1;


      let invoiceProfit = 0;
      if (invoice.items && Array.isArray(invoice.items)) {
        invoice.items.forEach(item => {
          const matchingInventory = items.find(invItem =>
            invItem.skuCode === item.sku || invItem.itemName === item.name
          );

          if (matchingInventory && matchingInventory.pricing) {
            const itemCost = matchingInventory.pricing.purchasePrice * (item.qty || 0);
            const itemRevenue = (item.unitPrice || 0) * (item.qty || 0);
            invoiceProfit += itemRevenue - itemCost;
          }
        });
      }
      salesByMonth[monthKey].profit += invoiceProfit;
    });


    const salesTrend = Object.values(salesByMonth);


    const currentMonth = new Date().getMonth();
    const lastMonthName = monthNames[currentMonth === 0 ? 11 : currentMonth - 1];
    const prevMonthName = monthNames[currentMonth <= 1 ? (currentMonth === 0 ? 10 : 11) : currentMonth - 2];

    const lastMonthData = salesByMonth[lastMonthName] || { revenue: 0, orders: 0 };
    const prevMonthData = salesByMonth[prevMonthName] || { revenue: 0, orders: 0 };

    const revenueChange = prevMonthData.revenue > 0
      ? (((lastMonthData.revenue - prevMonthData.revenue) / prevMonthData.revenue) * 100).toFixed(1)
      : 0;

    const ordersChange = prevMonthData.orders > 0
      ? (((lastMonthData.orders - prevMonthData.orders) / prevMonthData.orders) * 100).toFixed(1)
      : 0;


    const currentMonthLowStock = lowStockCount;
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthItems = await Inventory.find({
      isActive: true,
      isDeleted: false,
      updatedAt: { $lte: lastMonth }
    });
    const lastMonthLowStock = lastMonthItems.filter(item => item.isLowStock).length;
    const lowStockChange = lastMonthLowStock > 0
      ? (((currentMonthLowStock - lastMonthLowStock) / lastMonthLowStock) * 100).toFixed(1)
      : 0;

    const profitMarginChange = prevMonthData.revenue > 0 && lastMonthData.revenue > 0
      ? (((lastMonthData.profit / lastMonthData.revenue) - (prevMonthData.profit / prevMonthData.revenue)) * 100).toFixed(1)
      : 0;


    const syncStats = await getSyncStatistics();
    const syncWarnings = syncStats ? generateSyncWarnings(syncStats) : [];

    const responseData = {
      success: true,
      data: {
        summary: {
          totalItems,
          totalValue,
          lowStockCount,
          reorderCount,
          totalRevenue,
          totalOrders,
          avgOrderValue,
          totalProfit,
          profitMargin,
          revenueChange,
          ordersChange,
          lowStockChange,
          profitMarginChange,

          totalPurchaseAmount,
          totalPurchaseOrders,
          avgPurchaseValue,
          dataSource: 'automation'
        },
        categoryStats,
        recentActivity,
        topSellingItems,
        salesTrend,
        syncStatus: syncStats ? {
          lastSync: syncStats.lastSync,
          last24Hours: syncStats.last24Hours,
          weeklyStats: syncStats.weeklyStats,
          health: {
            status: syncWarnings.some(w => w.level === 'critical') ? 'critical' :
                    syncWarnings.some(w => w.level === 'error') ? 'error' :
                    syncWarnings.some(w => w.level === 'warning') ? 'warning' : 'healthy',
            isDataStale: syncStats.health.isDataStale,
            hoursSinceLastSync: syncStats.health.hoursSinceLastSync,
            pendingRecords: syncStats.health.pendingRecords
          },
          warnings: syncWarnings
        } : null
      }
    };

    console.log('Final response summary:', {
      totalRevenue: responseData.data.summary.totalRevenue,
      totalOrders: responseData.data.summary.totalOrders,
      totalPurchaseAmount: responseData.data.summary.totalPurchaseAmount,
      totalPurchaseOrders: responseData.data.summary.totalPurchaseOrders,
      profitMargin: responseData.data.summary.profitMargin,
      salesTrendLength: responseData.data.salesTrend.length,
      topSellingItemsCount: responseData.data.topSellingItems.length,
      syncStatus: responseData.data.syncStatus ? 'included' : 'not available',
      dataSource: 'automation'
    });
    console.log('=== END DASHBOARD DEBUG ===');

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Get dashboard error:', error);
    next(error);
  }
};




const getStockSummary = async (req, res, next) => {
  try {
    const { category } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const items = await Inventory.find(query).select('itemName skuCode category quantity pricing syncMetadata');

    
    const syncStats = await getSyncStatistics();
    const syncWarnings = syncStats ? generateSyncWarnings(syncStats) : [];

    const summary = items.map(item => {
      const hoursSinceSync = item.syncMetadata?.lastSyncedAt
        ? ((Date.now() - new Date(item.syncMetadata.lastSyncedAt).getTime()) / (1000 * 60 * 60)).toFixed(1)
        : null;

      return {
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        category: item.category,
        currentStock: item.quantity.current,
        minimumStock: item.quantity.minimum,
        unit: item.quantity.unit,
        purchasePrice: item.pricing.purchasePrice,
        sellingPrice: item.pricing.sellingPrice,
        totalValue: item.pricing.sellingPrice * item.quantity.current,
        profitMargin: item.pricing.profitMargin,
        status: item.isLowStock ? 'Low Stock' : 'Adequate',
        syncMetadata: item.syncMetadata ? {
          lastSynced: item.syncMetadata.lastSyncedAt,
          quickBooksId: item.syncMetadata.quickBooksId,
          syncStatus: item.syncMetadata.syncStatus,
          hoursSinceSync: hoursSinceSync ? parseFloat(hoursSinceSync) : null,
          dataStale: hoursSinceSync && parseFloat(hoursSinceSync) > 48 
        } : null
      };
    });


    const totals = {
      totalItems: summary.length,
      totalQuantity: summary.reduce((sum, item) => sum + item.currentStock, 0),
      totalValue: summary.reduce((sum, item) => sum + item.totalValue, 0),
      lowStockItems: summary.filter(item => item.status === 'Low Stock').length,
      syncedItems: summary.filter(item => item.syncMetadata?.quickBooksId).length,
      unsyncedItems: summary.filter(item => !item.syncMetadata?.quickBooksId).length,
      staleItems: summary.filter(item => item.syncMetadata?.dataStale).length
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        totals,
        syncStatus: syncStats ? {
          lastSync: syncStats.lastSync,
          health: {
            status: syncWarnings.some(w => w.level === 'critical') ? 'critical' :
                    syncWarnings.some(w => w.level === 'error') ? 'error' :
                    syncWarnings.some(w => w.level === 'warning') ? 'warning' : 'healthy',
            isDataStale: syncStats.health.isDataStale,
            hoursSinceLastSync: syncStats.health.hoursSinceLastSync
          },
          warnings: syncWarnings
        } : null
      }
    });
  } catch (error) {
    console.error('Get stock summary error:', error);
    next(error);
  }
};




const getProfitMarginReport = async (req, res, next) => {
  try {
    const { sortBy = 'margin' } = req.query;

    const items = await Inventory.find({ isActive: true })
      .select('itemName skuCode category quantity pricing syncMetadata');

    
    const syncStats = await getSyncStatistics();

    const profitData = items.map(item => {
      const totalCost = item.pricing.purchasePrice * item.quantity.current;
      const totalRevenue = item.pricing.sellingPrice * item.quantity.current;
      const totalProfit = totalRevenue - totalCost;

      return {
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        category: item.category,
        quantity: item.quantity.current,
        purchasePrice: item.pricing.purchasePrice,
        sellingPrice: item.pricing.sellingPrice,
        profitMargin: item.pricing.profitMargin,
        unitProfit: item.pricing.sellingPrice - item.pricing.purchasePrice,
        totalCost,
        totalRevenue,
        totalProfit,
        synced: !!item.syncMetadata?.quickBooksId
      };
    });


    if (sortBy === 'margin') {
      profitData.sort((a, b) => b.profitMargin - a.profitMargin);
    } else if (sortBy === 'profit') {
      profitData.sort((a, b) => b.totalProfit - a.totalProfit);
    } else if (sortBy === 'revenue') {
      profitData.sort((a, b) => b.totalRevenue - a.totalRevenue);
    }


    const overallStats = {
      totalRevenue: profitData.reduce((sum, item) => sum + item.totalRevenue, 0),
      totalCost: profitData.reduce((sum, item) => sum + item.totalCost, 0),
      totalProfit: profitData.reduce((sum, item) => sum + item.totalProfit, 0),
      averageMargin: profitData.reduce((sum, item) => sum + item.profitMargin, 0) / profitData.length || 0,
      syncedItems: profitData.filter(item => item.synced).length,
      totalItems: profitData.length
    };

    res.status(200).json({
      success: true,
      data: {
        items: profitData,
        stats: overallStats,
        syncStatus: syncStats ? {
          lastSync: syncStats.lastSync,
          successRate: syncStats.weeklyStats.successRate
        } : null
      }
    });
  } catch (error) {
    console.error('Get profit margin report error:', error);
    next(error);
  }
};




const getReorderList = async (req, res, next) => {
  try {
    const items = await Inventory.find({ isActive: true })
      .populate('createdBy', 'username fullName');

    
    const syncStats = await getSyncStatistics();
    const syncWarnings = syncStats ? generateSyncWarnings(syncStats) : [];

    const reorderItems = items
      .filter(item => item.needsReorder)
      .map(item => ({
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        category: item.category,
        currentStock: item.quantity.current,
        minimumStock: item.quantity.minimum,
        reorderPoint: item.supplier.reorderPoint,
        supplierName: item.supplier.name,
        supplierEmail: item.supplier.email,
        supplierPhone: item.supplier.phone,
        minimumOrderQuantity: item.supplier.minimumOrderQuantity,
        leadTime: item.supplier.leadTime,
        suggestedOrderQuantity: Math.max(
          item.supplier.minimumOrderQuantity,
          item.quantity.minimum - item.quantity.current + 10
        ),
        syncStatus: item.syncMetadata?.syncStatus || 'not_synced'
      }))
      .sort((a, b) => a.currentStock - b.currentStock);

    res.status(200).json({
      success: true,
      data: {
        items: reorderItems,
        count: reorderItems.length,
        syncStatus: syncStats ? {
          health: {
            status: syncWarnings.some(w => w.level === 'critical') ? 'critical' :
                    syncWarnings.some(w => w.level === 'error') ? 'error' :
                    syncWarnings.some(w => w.level === 'warning') ? 'warning' : 'healthy'
          },
          warnings: syncWarnings
        } : null
      }
    });
  } catch (error) {
    console.error('Get reorder list error:', error);
    next(error);
  }
};




const getAuditLogs = async (req, res, next) => {
  try {
    const { action, resource, from, to, page = 1, limit = 50 } = req.query;

    const query = {};
    if (action) query.action = action;
    if (resource) query.resource = resource;
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AuditLog.countDocuments(query);

    const logs = await AuditLog.find(query)
      .populate('performedBy', 'username fullName role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    next(error);
  }
};




const getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, category, groupBy = 'day' } = req.query;


    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }


    const query = { status: { $ne: 'cancelled' }, ...dateFilter };
    const invoices = await Invoice.find(query)
      .populate('createdBy', 'username fullName')
      .populate('items.inventory', 'pricing category')
      .sort({ invoiceDate: -1 });


    let filteredInvoices = invoices;
    if (category) {
      filteredInvoices = invoices.filter(invoice =>
        invoice.items.some(item => {
          return item.inventory && item.inventory.category === category;
        })
      );
    }


    const totalSales = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    let totalCost = 0;
    let totalProfit = 0;

    filteredInvoices.forEach(inv => {
      inv.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          totalCost += itemCost;
          totalProfit += item.subtotal - itemCost;
        }
      });
    });

    const totalInvoices = filteredInvoices.length;
    const averageOrderValue = totalInvoices > 0 ? totalSales / totalInvoices : 0;


    const salesByPeriod = {};
    filteredInvoices.forEach(invoice => {
      let periodKey;
      const date = new Date(invoice.invoiceDate);

      if (groupBy === 'day') {
        periodKey = date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (groupBy === 'year') {
        periodKey = String(date.getFullYear());
      }

      if (!salesByPeriod[periodKey]) {
        salesByPeriod[periodKey] = {
          period: periodKey,
          sales: 0,
          cost: 0,
          profit: 0,
          invoices: 0
        };
      }

      salesByPeriod[periodKey].sales += invoice.totalAmount;
      salesByPeriod[periodKey].invoices += 1;


      invoice.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          salesByPeriod[periodKey].cost += itemCost;
          salesByPeriod[periodKey].profit += item.subtotal - itemCost;
        }
      });
    });


    const chartData = Object.values(salesByPeriod).sort((a, b) =>
      a.period.localeCompare(b.period)
    );


    const categoryStats = {};
    filteredInvoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const itemCategory = item.inventory?.category || 'Uncategorized';
        if (!categoryStats[itemCategory]) {
          categoryStats[itemCategory] = {
            category: itemCategory,
            sales: 0,
            quantity: 0,
            profit: 0
          };
        }
        categoryStats[itemCategory].sales += item.subtotal;
        categoryStats[itemCategory].quantity += item.quantity;
        if (item.inventory && item.inventory.pricing) {
          const itemProfit = item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
          categoryStats[itemCategory].profit += itemProfit;
        }
      });
    });


    const paymentStatusStats = filteredInvoices.reduce((acc, invoice) => {
      const status = invoice.paymentStatus || 'pending';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});


    const recentInvoices = filteredInvoices.slice(0, 10).map(inv => {
      let invoiceProfit = 0;
      inv.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          invoiceProfit += item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
        }
      });

      return {
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer.name,
        invoiceDate: inv.invoiceDate,
        totalAmount: inv.totalAmount,
        status: inv.status,
        paymentStatus: inv.paymentStatus,
        profit: invoiceProfit
      };
    });

    
    const syncStats = await getSyncStatistics();

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalSales,
          totalCost,
          totalProfit,
          totalInvoices,
          averageOrderValue,
          profitMargin: totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(2) : 0
        },
        chartData,
        categoryStats: Object.values(categoryStats).sort((a, b) => b.sales - a.sales),
        paymentStatusStats,
        recentInvoices,
        syncStatus: syncStats ? {
          lastSync: syncStats.lastSync,
          successRate: syncStats.weeklyStats.successRate
        } : null
      }
    });
  } catch (error) {
    console.error('Get sales report error:', error);
    next(error);
  }
};




const getInventoryValuation = async (req, res, next) => {
  try {
    const { category } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const items = await Inventory.find(query)
      .select('itemName skuCode category quantity pricing supplier syncMetadata');

    
    const syncStats = await getSyncStatistics();
    const syncWarnings = syncStats ? generateSyncWarnings(syncStats) : [];


    const valuationData = items.map(item => {
      const costValue = item.pricing.purchasePrice * item.quantity.current;
      const sellingValue = item.pricing.sellingPrice * item.quantity.current;
      const potentialProfit = sellingValue - costValue;

      return {
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        category: item.category,
        quantity: item.quantity.current,
        unit: item.quantity.unit,
        purchasePrice: item.pricing.purchasePrice,
        sellingPrice: item.pricing.sellingPrice,
        costValue,
        sellingValue,
        potentialProfit,
        profitMargin: item.pricing.profitMargin,
        supplierName: item.supplier.name,
        synced: !!item.syncMetadata?.quickBooksId
      };
    });


    valuationData.sort((a, b) => b.sellingValue - a.sellingValue);


    const totals = {
      totalItems: valuationData.length,
      totalQuantity: valuationData.reduce((sum, item) => sum + item.quantity, 0),
      totalCostValue: valuationData.reduce((sum, item) => sum + item.costValue, 0),
      totalSellingValue: valuationData.reduce((sum, item) => sum + item.sellingValue, 0),
      totalPotentialProfit: valuationData.reduce((sum, item) => sum + item.potentialProfit, 0),
      averageProfitMargin: valuationData.reduce((sum, item) => sum + item.profitMargin, 0) / valuationData.length || 0,
      syncedItems: valuationData.filter(item => item.synced).length
    };


    const categoryBreakdown = {};
    valuationData.forEach(item => {
      if (!categoryBreakdown[item.category]) {
        categoryBreakdown[item.category] = {
          category: item.category,
          items: 0,
          costValue: 0,
          sellingValue: 0,
          potentialProfit: 0
        };
      }
      categoryBreakdown[item.category].items += 1;
      categoryBreakdown[item.category].costValue += item.costValue;
      categoryBreakdown[item.category].sellingValue += item.sellingValue;
      categoryBreakdown[item.category].potentialProfit += item.potentialProfit;
    });


    const topValueItems = valuationData.slice(0, 10);

    res.status(200).json({
      success: true,
      data: {
        totals,
        categoryBreakdown: Object.values(categoryBreakdown).sort((a, b) => b.sellingValue - a.sellingValue),
        topValueItems,
        allItems: valuationData,
        syncStatus: syncStats ? {
          lastSync: syncStats.lastSync,
          health: {
            status: syncWarnings.some(w => w.level === 'critical') ? 'critical' :
                    syncWarnings.some(w => w.level === 'error') ? 'error' :
                    syncWarnings.some(w => w.level === 'warning') ? 'warning' : 'healthy',
            isDataStale: syncStats.health.isDataStale
          },
          warnings: syncWarnings
        } : null
      }
    });
  } catch (error) {
    console.error('Get inventory valuation error:', error);
    next(error);
  }
};




const getTopSellingItems = async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 20, category } = req.query;


    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }


    const query = { status: { $ne: 'cancelled' }, ...dateFilter };
    const invoices = await Invoice.find(query).populate('items.inventory', 'pricing category');


    const itemSales = {};
    invoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const itemCategory = item.inventory?.category || 'Uncategorized';


        if (category && itemCategory !== category) return;

        const key = item.skuCode || item.itemName;
        if (!itemSales[key]) {
          itemSales[key] = {
            itemName: item.itemName,
            skuCode: item.skuCode,
            category: itemCategory,
            totalQuantitySold: 0,
            totalRevenue: 0,
            totalProfit: 0,
            invoiceCount: 0,
            averagePrice: 0
          };
        }

        itemSales[key].totalQuantitySold += item.quantity;
        itemSales[key].totalRevenue += item.subtotal;


        if (item.inventory && item.inventory.pricing) {
          const itemProfit = item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
          itemSales[key].totalProfit += itemProfit;
        }

        itemSales[key].invoiceCount += 1;
      });
    });


    const topSellingItems = Object.values(itemSales)
      .map(item => ({
        ...item,
        averagePrice: item.totalQuantitySold > 0 ? item.totalRevenue / item.totalQuantitySold : 0,
        averageProfitPerUnit: item.totalQuantitySold > 0 ? item.totalProfit / item.totalQuantitySold : 0
      }))
      .sort((a, b) => b.totalQuantitySold - a.totalQuantitySold)
      .slice(0, parseInt(limit));


    const summary = {
      totalItems: topSellingItems.length,
      totalQuantitySold: topSellingItems.reduce((sum, item) => sum + item.totalQuantitySold, 0),
      totalRevenue: topSellingItems.reduce((sum, item) => sum + item.totalRevenue, 0),
      totalProfit: topSellingItems.reduce((sum, item) => sum + item.totalProfit, 0)
    };

    
    const syncStats = await getSyncStatistics();

    res.status(200).json({
      success: true,
      data: {
        summary,
        items: topSellingItems,
        syncStatus: syncStats ? {
          lastSync: syncStats.lastSync,
          successRate: syncStats.weeklyStats.successRate
        } : null
      }
    });
  } catch (error) {
    console.error('Get top selling items error:', error);
    next(error);
  }
};




const getCustomerReport = async (req, res, next) => {
  try {
    const { startDate, endDate, email, sortBy = 'totalSpent' } = req.query;


    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }


    const query = { status: { $ne: 'cancelled' }, ...dateFilter };
    if (email) query['customer.email'] = email.toLowerCase();

    const invoices = await Invoice.find(query)
      .populate('items.inventory', 'pricing')
      .sort({ invoiceDate: -1 });


    const customerData = {};
    invoices.forEach(invoice => {
      const customerKey = invoice.customer.email || invoice.customer.name;

      if (!customerData[customerKey]) {
        customerData[customerKey] = {
          name: invoice.customer.name,
          email: invoice.customer.email,
          phone: invoice.customer.phone,
          totalInvoices: 0,
          totalSpent: 0,
          totalProfit: 0,
          lastPurchaseDate: invoice.invoiceDate,
          firstPurchaseDate: invoice.invoiceDate,
          averageOrderValue: 0,
          itemsPurchased: 0,
          invoices: []
        };
      }

      customerData[customerKey].totalInvoices += 1;
      customerData[customerKey].totalSpent += invoice.totalAmount;
      customerData[customerKey].itemsPurchased += invoice.items.reduce((sum, item) => sum + item.quantity, 0);


      let invoiceProfit = 0;
      invoice.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          invoiceProfit += item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
        }
      });
      customerData[customerKey].totalProfit += invoiceProfit;


      if (invoice.invoiceDate > customerData[customerKey].lastPurchaseDate) {
        customerData[customerKey].lastPurchaseDate = invoice.invoiceDate;
      }
      if (invoice.invoiceDate < customerData[customerKey].firstPurchaseDate) {
        customerData[customerKey].firstPurchaseDate = invoice.invoiceDate;
      }


      customerData[customerKey].invoices.push({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        totalAmount: invoice.totalAmount,
        status: invoice.status,
        paymentStatus: invoice.paymentStatus
      });
    });


    let customers = Object.values(customerData).map(customer => ({
      ...customer,
      averageOrderValue: customer.totalInvoices > 0 ? customer.totalSpent / customer.totalInvoices : 0
    }));


    if (sortBy === 'totalSpent') {
      customers.sort((a, b) => b.totalSpent - a.totalSpent);
    } else if (sortBy === 'totalInvoices') {
      customers.sort((a, b) => b.totalInvoices - a.totalInvoices);
    } else if (sortBy === 'lastPurchase') {
      customers.sort((a, b) => new Date(b.lastPurchaseDate) - new Date(a.lastPurchaseDate));
    }


    const summary = {
      totalCustomers: customers.length,
      totalRevenue: customers.reduce((sum, c) => sum + c.totalSpent, 0),
      totalProfit: customers.reduce((sum, c) => sum + c.totalProfit, 0),
      averageCustomerValue: customers.length > 0 ?
        customers.reduce((sum, c) => sum + c.totalSpent, 0) / customers.length : 0,
      totalInvoices: customers.reduce((sum, c) => sum + c.totalInvoices, 0)
    };

    
    const syncStats = await getSyncStatistics();

    res.status(200).json({
      success: true,
      data: {
        summary,
        customers,
        syncStatus: syncStats ? {
          lastSync: syncStats.lastSync,
          successRate: syncStats.weeklyStats.successRate
        } : null
      }
    });
  } catch (error) {
    console.error('Get customer report error:', error);
    next(error);
  }
};




const getLowStockReport = async (req, res, next) => {
  try {
    const { category, includeReorderOnly = 'false' } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const items = await Inventory.find(query)
      .populate('createdBy', 'username fullName')
      .sort({ 'quantity.current': 1 });

    
    const syncStats = await getSyncStatistics();
    const syncWarnings = syncStats ? generateSyncWarnings(syncStats) : [];


    const filteredItems = items.filter(item => {
      if (includeReorderOnly === 'true') {
        return item.needsReorder;
      }
      return item.isLowStock;
    });

    const lowStockItems = filteredItems.map(item => {
      const daysOfStockLeft = item.quantity.current;
      const suggestedOrderQuantity = Math.max(
        item.supplier.minimumOrderQuantity,
        item.quantity.minimum - item.quantity.current + 20
      );
      const orderCost = suggestedOrderQuantity * item.pricing.purchasePrice;

      return {
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        category: item.category,
        currentStock: item.quantity.current,
        minimumStock: item.quantity.minimum,
        reorderPoint: item.supplier.reorderPoint,
        unit: item.quantity.unit,
        status: item.needsReorder ? 'Needs Reorder' : 'Low Stock',
        daysOfStockLeft,
        supplier: {
          name: item.supplier.name,
          contactPerson: item.supplier.contactPerson,
          email: item.supplier.email,
          phone: item.supplier.phone,
          address: item.supplier.address,
          leadTime: item.supplier.leadTime,
          minimumOrderQuantity: item.supplier.minimumOrderQuantity
        },
        pricing: {
          purchasePrice: item.pricing.purchasePrice,
          sellingPrice: item.pricing.sellingPrice
        },
        suggestedOrderQuantity,
        orderCost,
        priority: item.quantity.current <= item.supplier.reorderPoint ? 'High' :
                  item.quantity.current <= item.quantity.minimum ? 'Medium' : 'Low',
        syncStatus: item.syncMetadata?.syncStatus || 'not_synced'
      };
    });


    lowStockItems.sort((a, b) => {
      const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
      if (priorityOrder[b.priority] !== priorityOrder[a.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return a.currentStock - b.currentStock;
    });


    const summary = {
      totalItems: lowStockItems.length,
      highPriority: lowStockItems.filter(i => i.priority === 'High').length,
      mediumPriority: lowStockItems.filter(i => i.priority === 'Medium').length,
      lowPriority: lowStockItems.filter(i => i.priority === 'Low').length,
      totalOrderCost: lowStockItems.reduce((sum, item) => sum + item.orderCost, 0)
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        items: lowStockItems,
        syncStatus: syncStats ? {
          lastSync: syncStats.lastSync,
          health: {
            status: syncWarnings.some(w => w.level === 'critical') ? 'critical' :
                    syncWarnings.some(w => w.level === 'error') ? 'error' :
                    syncWarnings.some(w => w.level === 'warning') ? 'warning' : 'healthy',
            isDataStale: syncStats.health.isDataStale,
            hoursSinceLastSync: syncStats.health.hoursSinceLastSync
          },
          warnings: syncWarnings
        } : null
      }
    });
  } catch (error) {
    console.error('Get low stock report error:', error);
    next(error);
  }
};




const getProfitAnalysis = async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;


    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }


    const invoiceQuery = { status: { $ne: 'cancelled' }, ...dateFilter };
    const invoices = await Invoice.find(invoiceQuery)
      .populate('items.inventory', 'pricing category')
      .sort({ invoiceDate: 1 });


    const inventory = await Inventory.find({ isActive: true });


    const profitByPeriod = {};
    invoices.forEach(invoice => {
      let periodKey;
      const date = new Date(invoice.invoiceDate);

      if (groupBy === 'day') {
        periodKey = date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (groupBy === 'year') {
        periodKey = String(date.getFullYear());
      }

      if (!profitByPeriod[periodKey]) {
        profitByPeriod[periodKey] = {
          period: periodKey,
          revenue: 0,
          cost: 0,
          profit: 0,
          profitMargin: 0,
          invoices: 0
        };
      }

      profitByPeriod[periodKey].revenue += invoice.totalAmount;
      profitByPeriod[periodKey].invoices += 1;


      invoice.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          profitByPeriod[periodKey].cost += itemCost;
          profitByPeriod[periodKey].profit += item.subtotal - itemCost;
        }
      });
    });


    const chartData = Object.values(profitByPeriod)
      .map(period => ({
        ...period,
        profitMargin: period.revenue > 0 ? ((period.profit / period.revenue) * 100).toFixed(2) : 0
      }))
      .sort((a, b) => a.period.localeCompare(b.period));


    const categoryProfit = {};
    invoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const itemCategory = item.inventory?.category || 'Uncategorized';

        if (!categoryProfit[itemCategory]) {
          categoryProfit[itemCategory] = {
            category: itemCategory,
            revenue: 0,
            cost: 0,
            profit: 0,
            profitMargin: 0,
            itemsSold: 0
          };
        }

        categoryProfit[itemCategory].revenue += item.subtotal;
        categoryProfit[itemCategory].itemsSold += item.quantity;

        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          categoryProfit[itemCategory].cost += itemCost;
          categoryProfit[itemCategory].profit += item.subtotal - itemCost;
        }
      });
    });


    const categoryChartData = Object.values(categoryProfit)
      .map(cat => ({
        ...cat,
        profitMargin: cat.revenue > 0 ? ((cat.profit / cat.revenue) * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.profit - a.profit);


    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    let totalCost = 0;
    let totalProfit = 0;

    invoices.forEach(inv => {
      inv.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          totalCost += itemCost;
          totalProfit += item.subtotal - itemCost;
        }
      });
    });

    const totalInvoices = invoices.length;


    const inventoryValue = inventory.reduce((sum, item) => {
      return sum + (item.pricing.sellingPrice * item.quantity.current);
    }, 0);
    const inventoryCost = inventory.reduce((sum, item) => {
      return sum + (item.pricing.purchasePrice * item.quantity.current);
    }, 0);
    const potentialProfit = inventoryValue - inventoryCost;


    const itemProfitMap = {};
    invoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const key = item.skuCode || item.itemName;
        if (!itemProfitMap[key]) {
          itemProfitMap[key] = {
            itemName: item.itemName,
            skuCode: item.skuCode,
            category: item.inventory?.category || 'Uncategorized',
            totalProfit: 0,
            totalRevenue: 0,
            quantitySold: 0
          };
        }

        itemProfitMap[key].totalRevenue += item.subtotal;
        itemProfitMap[key].quantitySold += item.quantity;

        if (item.inventory && item.inventory.pricing) {
          const itemProfit = item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
          itemProfitMap[key].totalProfit += itemProfit;
        }
      });
    });

    const topProfitableItems = Object.values(itemProfitMap)
      .map(item => ({
        ...item,
        profitMargin: item.totalRevenue > 0 ? ((item.totalProfit / item.totalRevenue) * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 10);

    
    const syncStats = await getSyncStatistics();

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalCost,
          totalProfit,
          totalInvoices,
          overallProfitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0,
          averageInvoiceProfit: totalInvoices > 0 ? (totalProfit / totalInvoices).toFixed(2) : 0,
          inventoryValue,
          inventoryCost,
          potentialProfit
        },
        chartData,
        categoryChartData,
        topProfitableItems,
        syncStatus: syncStats ? {
          lastSync: syncStats.lastSync,
          successRate: syncStats.weeklyStats.successRate
        } : null
      }
    });
  } catch (error) {
    console.error('Get profit analysis error:', error);
    next(error);
  }
};



const getInventorySyncHealth = async (req, res, next) => {
  try {
    
    const syncStats = await getSyncStatistics();

    if (!syncStats) {
      return res.status(200).json({
        success: true,
        data: {
          available: false,
          message: 'Sync statistics are not available'
        }
      });
    }

    
    const warnings = generateSyncWarnings(syncStats);

    
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSyncLogs = await SyncLog.find({
      startedAt: { $gte: last30Days }
    }).sort({ startedAt: -1 });

    
    const syncsByDay = {};
    recentSyncLogs.forEach(log => {
      const day = new Date(log.startedAt).toISOString().split('T')[0];
      if (!syncsByDay[day]) {
        syncsByDay[day] = {
          date: day,
          total: 0,
          successful: 0,
          failed: 0,
          inProgress: 0,
          totalRecordsProcessed: 0,
          totalDuration: 0
        };
      }
      syncsByDay[day].total += 1;
      if (log.status === 'SUCCESS' || log.status === 'completed') syncsByDay[day].successful += 1;
      if (log.status === 'FAILED') syncsByDay[day].failed += 1;
      if (log.status === 'IN_PROGRESS') syncsByDay[day].inProgress += 1;
      syncsByDay[day].totalRecordsProcessed += (log.recordsInserted || 0) + (log.recordsUpdated || 0);
      syncsByDay[day].totalDuration += log.duration || 0;
    });

    const dailySyncTrend = Object.values(syncsByDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(day => ({
        ...day,
        successRate: day.total > 0 ? ((day.successful / day.total) * 100).toFixed(2) : 0,
        avgDuration: day.successful > 0 ? (day.totalDuration / day.successful).toFixed(2) : 0
      }));

    
    const inventoryItems = await Inventory.find({ isActive: true })
      .select('itemName skuCode category syncMetadata')
      .limit(1000);

    const syncMetrics = {
      totalItems: inventoryItems.length,
      syncedItems: 0,
      unsyncedItems: 0,
      staleItems: 0,
      errorItems: 0,
      itemsByStatus: {}
    };

    const staleThresholdHours = 48; 
    inventoryItems.forEach(item => {
      if (item.syncMetadata?.quickBooksId) {
        syncMetrics.syncedItems += 1;

        
        if (item.syncMetadata.lastSyncedAt) {
          const hoursSinceSync = (Date.now() - new Date(item.syncMetadata.lastSyncedAt).getTime()) / (1000 * 60 * 60);
          if (hoursSinceSync > staleThresholdHours) {
            syncMetrics.staleItems += 1;
          }
        }

        
        const status = item.syncMetadata.syncStatus || 'unknown';
        syncMetrics.itemsByStatus[status] = (syncMetrics.itemsByStatus[status] || 0) + 1;

        if (status === 'error') {
          syncMetrics.errorItems += 1;
        }
      } else {
        syncMetrics.unsyncedItems += 1;
      }
    });

    
    let healthScore = 100;

    
    if (syncStats.health.isDataStale) healthScore -= 30;
    if (syncStats.weeklyStats.successRate < 90) healthScore -= 20;
    if (syncStats.weeklyStats.successRate < 70) healthScore -= 20; 
    if (syncMetrics.staleItems > syncMetrics.totalItems * 0.1) healthScore -= 15; 
    if (syncMetrics.unsyncedItems > syncMetrics.totalItems * 0.2) healthScore -= 15; 
    if (syncStats.health.pendingRecords > 50) healthScore -= 10;

    healthScore = Math.max(0, healthScore); 

    
    let healthStatus;
    if (healthScore >= 90) healthStatus = 'excellent';
    else if (healthScore >= 75) healthStatus = 'good';
    else if (healthScore >= 60) healthStatus = 'fair';
    else if (healthScore >= 40) healthStatus = 'poor';
    else healthStatus = 'critical';

    
    const errorLogs = recentSyncLogs
      .filter(log => log.status === 'FAILED' || (log.errors && log.errors.length > 0))
      .slice(0, 10)
      .map(log => ({
        timestamp: log.startedAt,
        source: log.source,
        status: log.status,
        errorMessage: log.errorMessage || 'Unknown error',
        recordsFailed: log.recordsFailed || 0
      }));

    res.status(200).json({
      success: true,
      data: {
        available: true,
        healthScore,
        healthStatus,
        overallStatus: syncStats.lastSync,
        metrics: {
          lastSync: syncStats.lastSync,
          last24Hours: syncStats.last24Hours,
          weeklyStats: syncStats.weeklyStats,
          inventoryMetrics: syncMetrics,
          staleThresholdHours
        },
        warnings,
        dailySyncTrend,
        errorLogs,
        recommendations: generateSyncRecommendations(syncStats, syncMetrics, healthScore)
      }
    });
  } catch (error) {
    console.error('Get inventory sync health error:', error);
    next(error);
  }
};


const generateSyncRecommendations = (syncStats, syncMetrics, healthScore) => {
  const recommendations = [];

  if (healthScore < 60) {
    recommendations.push({
      priority: 'high',
      action: 'Immediate attention required',
      description: 'Sync health is critically low. Review all errors and contact support if needed.'
    });
  }

  if (syncStats.health.isDataStale) {
    recommendations.push({
      priority: 'high',
      action: 'Run manual sync immediately',
      description: 'Data has not been successfully synchronized in the last 24 hours.'
    });
  }

  if (syncStats.weeklyStats.successRate < 70) {
    recommendations.push({
      priority: 'high',
      action: 'Review sync configuration',
      description: 'Success rate is below 70%. Check API credentials and network connectivity.'
    });
  }

  if (syncMetrics.unsyncedItems > syncMetrics.totalItems * 0.2) {
    recommendations.push({
      priority: 'medium',
      action: 'Sync unsynced inventory items',
      description: `${syncMetrics.unsyncedItems} items (${((syncMetrics.unsyncedItems / syncMetrics.totalItems) * 100).toFixed(1)}%) are not synced with external systems.`
    });
  }

  if (syncMetrics.staleItems > syncMetrics.totalItems * 0.1) {
    recommendations.push({
      priority: 'medium',
      action: 'Refresh stale inventory data',
      description: `${syncMetrics.staleItems} items have not been synced recently. Consider running a full sync.`
    });
  }

  if (syncStats.health.pendingRecords > 50) {
    recommendations.push({
      priority: 'medium',
      action: 'Process pending records',
      description: `${syncStats.health.pendingRecords} records are pending synchronization.`
    });
  }

  if (syncMetrics.errorItems > 0) {
    recommendations.push({
      priority: 'low',
      action: 'Fix items with sync errors',
      description: `${syncMetrics.errorItems} items have sync errors. Review error logs for details.`
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'info',
      action: 'No action needed',
      description: 'Sync health is good. Continue monitoring.'
    });
  }

  return recommendations;
};


const exportReportToCSV = async (req, res, next) => {
  try {
    const { type } = req.params;
    const queryParams = req.query;

    let data = [];
    let fields = [];
    let filename = `${type}-report`;


    switch (type) {
      case 'sales':
        const salesQuery = { status: { $ne: 'cancelled' } };
        if (queryParams.startDate) salesQuery.invoiceDate = { $gte: new Date(queryParams.startDate) };
        if (queryParams.endDate) {
          salesQuery.invoiceDate = salesQuery.invoiceDate || {};
          salesQuery.invoiceDate.$lte = new Date(queryParams.endDate);
        }

        const invoices = await Invoice.find(salesQuery)
          .populate('items.inventory', 'pricing')
          .sort({ invoiceDate: -1 });

        data = invoices.map(inv => {
          let totalCost = 0;
          let totalProfit = 0;

          inv.items.forEach(item => {
            if (item.inventory && item.inventory.pricing) {
              const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
              totalCost += itemCost;
              totalProfit += item.subtotal - itemCost;
            }
          });

          return {
            invoiceNumber: inv.invoiceNumber,
            customerName: inv.customer.name,
            customerEmail: inv.customer.email,
            invoiceDate: new Date(inv.invoiceDate).toISOString().split('T')[0],
            subtotal: inv.subtotalAmount,
            tax: inv.taxAmount,
            discount: inv.discount.amount,
            totalAmount: inv.totalAmount,
            totalCost: totalCost.toFixed(2),
            totalProfit: totalProfit.toFixed(2),
            status: inv.status,
            paymentStatus: inv.paymentStatus
          };
        });

        fields = ['invoiceNumber', 'customerName', 'customerEmail', 'invoiceDate', 'subtotal', 'tax', 'discount', 'totalAmount', 'totalCost', 'totalProfit', 'status', 'paymentStatus'];
        break;

      case 'inventory':
        const items = await Inventory.find({ isActive: true });
        data = items.map(item => ({
          skuCode: item.skuCode,
          itemName: item.itemName,
          category: item.category,
          currentStock: item.quantity.current,
          minimumStock: item.quantity.minimum,
          unit: item.quantity.unit,
          purchasePrice: item.pricing.purchasePrice,
          sellingPrice: item.pricing.sellingPrice,
          profitMargin: item.pricing.profitMargin.toFixed(2),
          totalValue: (item.pricing.sellingPrice * item.quantity.current).toFixed(2),
          supplierName: item.supplier.name,
          supplierEmail: item.supplier.email,
          status: item.isLowStock ? 'Low Stock' : 'Adequate',
          quickBooksId: item.syncMetadata?.quickBooksId || '',
          lastSynced: item.syncMetadata?.lastSyncedAt ? new Date(item.syncMetadata.lastSyncedAt).toISOString() : '',
          syncStatus: item.syncMetadata?.syncStatus || 'not_synced'
        }));
        fields = ['skuCode', 'itemName', 'category', 'currentStock', 'minimumStock', 'unit', 'purchasePrice', 'sellingPrice', 'profitMargin', 'totalValue', 'supplierName', 'supplierEmail', 'status', 'quickBooksId', 'lastSynced', 'syncStatus'];
        break;

      case 'stock-summary':
        const stockItems = await Inventory.find({ isActive: true });
        data = stockItems.map(item => ({
          skuCode: item.skuCode,
          itemName: item.itemName,
          category: item.category,
          currentStock: item.quantity.current,
          minimumStock: item.quantity.minimum,
          unit: item.quantity.unit,
          purchasePrice: item.pricing.purchasePrice,
          sellingPrice: item.pricing.sellingPrice,
          totalValue: (item.pricing.sellingPrice * item.quantity.current).toFixed(2),
          status: item.isLowStock ? 'Low Stock' : 'Adequate',
          syncStatus: item.syncMetadata?.syncStatus || 'not_synced'
        }));
        fields = ['skuCode', 'itemName', 'category', 'currentStock', 'minimumStock', 'unit', 'purchasePrice', 'sellingPrice', 'totalValue', 'status', 'syncStatus'];
        break;

      case 'low-stock':
        const lowStockItems = await Inventory.find({ isActive: true });
        const filtered = lowStockItems.filter(item => item.isLowStock);
        data = filtered.map(item => ({
          skuCode: item.skuCode,
          itemName: item.itemName,
          category: item.category,
          currentStock: item.quantity.current,
          minimumStock: item.quantity.minimum,
          reorderPoint: item.supplier.reorderPoint,
          supplierName: item.supplier.name,
          supplierEmail: item.supplier.email,
          supplierPhone: item.supplier.phone,
          leadTime: item.supplier.leadTime,
          minimumOrderQuantity: item.supplier.minimumOrderQuantity,
          syncStatus: item.syncMetadata?.syncStatus || 'not_synced'
        }));
        fields = ['skuCode', 'itemName', 'category', 'currentStock', 'minimumStock', 'reorderPoint', 'supplierName', 'supplierEmail', 'supplierPhone', 'leadTime', 'minimumOrderQuantity', 'syncStatus'];
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid report type'
        });
    }


    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(data);


    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}-${Date.now()}.csv"`);
    res.status(200).send(csv);

  } catch (error) {
    console.error('Export to CSV error:', error);
    next(error);
  }
};




const exportReportToPDF = async (req, res, next) => {
  try {
    const { type } = req.params;
    const queryParams = req.query;


    const doc = new PDFDocument({ margin: 50, size: 'A4' });


    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${Date.now()}.pdf"`);


    doc.pipe(res);


    doc.fontSize(20).text(`${type.toUpperCase().replace('-', ' ')} REPORT`, { align: 'center' });
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();


    switch (type) {
      case 'sales':
        const salesQuery = { status: { $ne: 'cancelled' } };
        if (queryParams.startDate) salesQuery.invoiceDate = { $gte: new Date(queryParams.startDate) };
        if (queryParams.endDate) {
          salesQuery.invoiceDate = salesQuery.invoiceDate || {};
          salesQuery.invoiceDate.$lte = new Date(queryParams.endDate);
        }

        const invoices = await Invoice.find(salesQuery)
          .populate('items.inventory', 'pricing')
          .sort({ invoiceDate: -1 })
          .limit(50);

        let totalSales = 0;
        let totalProfit = 0;

        invoices.forEach(inv => {
          totalSales += inv.totalAmount;
          inv.items.forEach(item => {
            if (item.inventory && item.inventory.pricing) {
              totalProfit += item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
            }
          });
        });

        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(10);
        doc.text(`Total Invoices: ${invoices.length}`);
        doc.text(`Total Sales: $${totalSales.toFixed(2)}`);
        doc.text(`Total Profit: $${totalProfit.toFixed(2)}`);
        doc.moveDown();

        doc.fontSize(14).text('Invoice Details', { underline: true });
        doc.fontSize(9);

        invoices.forEach((inv, index) => {
          if (index > 0 && index % 15 === 0) {
            doc.addPage();
          }
          doc.text(
            `${inv.invoiceNumber} | ${inv.customer.name} | ${new Date(inv.invoiceDate).toLocaleDateString()} | $${inv.totalAmount.toFixed(2)}`,
            { width: 500 }
          );
        });
        break;

      case 'inventory':
        const items = await Inventory.find({ isActive: true }).limit(100);
        const totalValue = items.reduce((sum, item) => sum + (item.pricing.sellingPrice * item.quantity.current), 0);
        const syncedCount = items.filter(item => item.syncMetadata?.quickBooksId).length;

        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(10);
        doc.text(`Total Items: ${items.length}`);
        doc.text(`Total Inventory Value: $${totalValue.toFixed(2)}`);
        doc.text(`Synced Items: ${syncedCount}`);
        doc.moveDown();

        doc.fontSize(14).text('Item Details', { underline: true });
        doc.fontSize(8);

        items.forEach((item, index) => {
          if (index > 0 && index % 20 === 0) {
            doc.addPage();
          }
          const itemValue = item.pricing.sellingPrice * item.quantity.current;
          const syncStatus = item.syncMetadata?.syncStatus || 'not_synced';
          doc.text(
            `${item.skuCode} | ${item.itemName} | Stock: ${item.quantity.current} | Value: $${itemValue.toFixed(2)} | Sync: ${syncStatus}`,
            { width: 500 }
          );
        });
        break;

      case 'low-stock':
        const allItems = await Inventory.find({ isActive: true });
        const lowStockItems = allItems.filter(item => item.isLowStock);

        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(10);
        doc.text(`Low Stock Items: ${lowStockItems.length}`);
        doc.moveDown();

        doc.fontSize(14).text('Items Requiring Attention', { underline: true });
        doc.fontSize(9);

        lowStockItems.forEach((item, index) => {
          if (index > 0 && index % 18 === 0) {
            doc.addPage();
          }
          doc.text(
            `${item.skuCode} | ${item.itemName} | Current: ${item.quantity.current} | Min: ${item.quantity.minimum} | Supplier: ${item.supplier.name}`,
            { width: 500 }
          );
        });
        break;

      default:
        doc.text('Report type not supported for PDF export');
    }


    doc.end();

  } catch (error) {
    console.error('Export to PDF error:', error);
    next(error);
  }
};




const getRecentActivity = async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;


    const activities = await AuditLog.find()
      .populate('performedBy', 'username fullName role')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        activities: activities.map(activity => ({
          id: activity._id,
          action: activity.action,
          resource: activity.resource,
          resourceId: activity.resourceId,
          performedBy: {
            id: activity.performedBy?._id,
            username: activity.performedBy?.username,
            fullName: activity.performedBy?.fullName,
            role: activity.performedBy?.role
          },
          details: activity.details,
          timestamp: activity.timestamp,
          ipAddress: activity.ipAddress
        }))
      }
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    next(error);
  }
};




const getDashboardSyncWidget = async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    
    const customerConnectLastSync = await SyncLog.getLatestSync('customerconnect');
    const routeStarLastSync = await SyncLog.getLatestSync('routestar');

    
    const customerConnectStats = await SyncLog.getSyncStats('customerconnect', 7);
    const routeStarStats = await SyncLog.getSyncStats('routestar', 7);

    
    const customerConnectSuccessRate = customerConnectStats && customerConnectStats.totalSyncs > 0
      ? ((customerConnectStats.successfulSyncs / customerConnectStats.totalSyncs) * 100).toFixed(1)
      : 0;

    const routeStarSuccessRate = routeStarStats && routeStarStats.totalSyncs > 0
      ? ((routeStarStats.successfulSyncs / routeStarStats.totalSyncs) * 100).toFixed(1)
      : 0;

    
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const pendingStockMovementsCount = await StockMovement.countDocuments({
      timestamp: { $gte: oneDayAgo }
    });

    
    const syncErrorsRequiringAttention = await SyncLog.find({
      status: 'FAILED',
      startedAt: { $gte: sevenDaysAgo }
    })
      .sort({ startedAt: -1 })
      .limit(5)
      .populate('triggeredBy', 'username fullName')
      .select('source startedAt errorMessage status');

    
    const now = new Date();
    const getFreshnessStatus = (lastSyncDate) => {
      if (!lastSyncDate) return { status: 'unknown', label: 'Never synced', color: 'gray' };

      const timeDiff = now - new Date(lastSyncDate);
      const minutesDiff = Math.floor(timeDiff / (1000 * 60));

      if (minutesDiff < 60) {
        return {
          status: 'fresh',
          label: `${minutesDiff} min${minutesDiff !== 1 ? 's' : ''} ago`,
          color: 'green',
          minutesAgo: minutesDiff
        };
      } else if (minutesDiff < 120) {
        return {
          status: 'good',
          label: `${Math.floor(minutesDiff / 60)} hour ago`,
          color: 'blue',
          minutesAgo: minutesDiff
        };
      } else if (minutesDiff < 1440) {
        return {
          status: 'aging',
          label: `${Math.floor(minutesDiff / 60)} hours ago`,
          color: 'yellow',
          minutesAgo: minutesDiff
        };
      } else {
        const daysDiff = Math.floor(minutesDiff / 1440);
        return {
          status: 'stale',
          label: `${daysDiff} day${daysDiff !== 1 ? 's' : ''} ago`,
          color: 'red',
          minutesAgo: minutesDiff
        };
      }
    };

    const customerConnectFreshness = getFreshnessStatus(customerConnectLastSync?.endedAt);
    const routeStarFreshness = getFreshnessStatus(routeStarLastSync?.endedAt);

    
    const scheduler = getScheduler();
    const schedulerStatus = scheduler.getStatus();
    const syncIntervalMinutes = parseInt(process.env.SYNC_INTERVAL_MINUTES) || 30;

    const calculateNextSyncTime = (lastRunTime) => {
      if (!lastRunTime) return null;
      const nextSync = new Date(lastRunTime);
      nextSync.setMinutes(nextSync.getMinutes() + syncIntervalMinutes);
      return nextSync;
    };

    const nextCustomerConnectSync = schedulerStatus.isRunning && schedulerStatus.lastRun.customerConnect
      ? calculateNextSyncTime(schedulerStatus.lastRun.customerConnect)
      : null;

    const nextRouteStarSync = schedulerStatus.isRunning && schedulerStatus.lastRun.routeStar
      ? calculateNextSyncTime(schedulerStatus.lastRun.routeStar)
      : null;

    
    const responseData = {
      success: true,
      data: {
        lastSyncTimes: {
          customerConnect: {
            lastSync: customerConnectLastSync?.endedAt || null,
            status: customerConnectLastSync?.status || 'unknown',
            duration: customerConnectLastSync?.duration || null,
            recordsProcessed: {
              found: customerConnectLastSync?.recordsFound || 0,
              inserted: customerConnectLastSync?.recordsInserted || 0,
              updated: customerConnectLastSync?.recordsUpdated || 0,
              failed: customerConnectLastSync?.recordsFailed || 0
            }
          },
          routeStar: {
            lastSync: routeStarLastSync?.endedAt || null,
            status: routeStarLastSync?.status || 'unknown',
            duration: routeStarLastSync?.duration || null,
            recordsProcessed: {
              found: routeStarLastSync?.recordsFound || 0,
              inserted: routeStarLastSync?.recordsInserted || 0,
              updated: routeStarLastSync?.recordsUpdated || 0,
              failed: routeStarLastSync?.recordsFailed || 0
            }
          }
        },
        successRates: {
          customerConnect: {
            rate: parseFloat(customerConnectSuccessRate),
            successful: customerConnectStats?.successfulSyncs || 0,
            failed: customerConnectStats?.failedSyncs || 0,
            total: customerConnectStats?.totalSyncs || 0,
            period: 'last 7 days'
          },
          routeStar: {
            rate: parseFloat(routeStarSuccessRate),
            successful: routeStarStats?.successfulSyncs || 0,
            failed: routeStarStats?.failedSyncs || 0,
            total: routeStarStats?.totalSyncs || 0,
            period: 'last 7 days'
          }
        },
        pendingStockMovements: {
          count: pendingStockMovementsCount,
          period: 'last 24 hours'
        },
        syncErrors: {
          count: syncErrorsRequiringAttention.length,
          errors: syncErrorsRequiringAttention.map(error => ({
            id: error._id,
            source: error.source,
            timestamp: error.startedAt,
            message: error.errorMessage,
            status: error.status,
            triggeredBy: error.triggeredBy ? {
              username: error.triggeredBy.username,
              fullName: error.triggeredBy.fullName
            } : null
          }))
        },
        dataFreshness: {
          customerConnect: customerConnectFreshness,
          routeStar: routeStarFreshness,
          overall: {
            status: (customerConnectFreshness.status === 'fresh' && routeStarFreshness.status === 'fresh')
              ? 'fresh'
              : (customerConnectFreshness.status === 'stale' || routeStarFreshness.status === 'stale')
              ? 'stale'
              : 'aging',
            label: 'Combined data freshness'
          }
        },
        nextScheduledSync: {
          schedulerRunning: schedulerStatus.isRunning,
          intervalMinutes: syncIntervalMinutes,
          customerConnect: nextCustomerConnectSync,
          routeStar: nextRouteStarSync,
          timezone: process.env.TZ || 'America/New_York'
        }
      }
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Get dashboard sync widget error:', error);
    next(error);
  }
};





const getInventorySyncStatus = async (req, res, next) => {
  try {
    const syncStats = await getSyncStatistics();

    const healthScore = calculateHealthScore(syncStats);

    res.status(200).json({
      success: true,
      data: {
        healthScore,
        healthStatus: healthScore >= 90 ? 'excellent' : healthScore >= 70 ? 'good' : healthScore >= 50 ? 'fair' : 'poor',
        syncSources: {
          customerConnect: {
            lastSync: syncStats.lastCustomerConnectSync,
            totalOrders: syncStats.customerConnectOrders,
            successRate: syncStats.customerConnectSuccessRate,
            recentErrors: syncStats.customerConnectErrors
          },
          routeStar: {
            lastSync: syncStats.lastRouteStarSync,
            totalInvoices: syncStats.routeStarInvoices,
            successRate: syncStats.routeStarSuccessRate,
            recentErrors: syncStats.routeStarErrors
          }
        },
        pendingStockMovements: syncStats.pendingStockMovements,
        warnings: generateSyncWarnings(syncStats),
        lastChecked: new Date()
      }
    });
  } catch (error) {
    console.error('Get inventory sync status error:', error);
    next(error);
  }
};


const getSyncHistory = async (req, res, next) => {
  try {
    const { source, limit = 20 } = req.query;

    const query = {};
    if (source) {
      query.source = source;
    }

    const syncLogs = await SyncLog.find(query)
      .sort({ startedAt: -1 })
      .limit(parseInt(limit))
      .populate('triggeredBy', 'username fullName email')
      .lean();

    const history = syncLogs.map(log => ({
      id: log._id,
      source: log.source,
      status: log.status,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      duration: log.duration,
      recordsProcessed: log.recordsProcessed,
      recordsCreated: log.recordsCreated,
      recordsUpdated: log.recordsUpdated,
      recordsFailed: log.recordsFailed,
      errorMessage: log.errorMessage,
      triggeredBy: log.triggeredBy ? {
        username: log.triggeredBy.username,
        fullName: log.triggeredBy.fullName
      } : null
    }));

    res.status(200).json({
      success: true,
      data: {
        history,
        total: syncLogs.length
      }
    });
  } catch (error) {
    console.error('Get sync history error:', error);
    next(error);
  }
};


const getStockProcessingStatus = async (req, res, next) => {
  try {
    const { source } = req.query;

    
    const customerConnectQuery = { stockProcessed: false };
    if (source === 'customerconnect' || !source) {
      const unprocessedOrders = await CustomerConnectOrder.find(customerConnectQuery)
        .sort({ lastSyncedAt: -1 })
        .limit(50)
        .select('orderNumber lastSyncedAt items')
        .lean();

      var customerConnectPending = unprocessedOrders.map(order => ({
        id: order._id,
        type: 'order',
        source: 'customerconnect',
        orderNumber: order.orderNumber,
        lastSyncedAt: order.lastSyncedAt,
        itemCount: order.items?.length || 0
      }));
    } else {
      var customerConnectPending = [];
    }

    
    const routeStarQuery = { stockProcessed: false };
    if (source === 'routestar' || !source) {
      const unprocessedInvoices = await RouteStarInvoice.find(routeStarQuery)
        .sort({ lastSyncedAt: -1 })
        .limit(50)
        .select('invoiceNumber lastSyncedAt lineItems')
        .lean();

      var routeStarPending = unprocessedInvoices.map(invoice => ({
        id: invoice._id,
        type: 'invoice',
        source: 'routestar',
        invoiceNumber: invoice.invoiceNumber,
        lastSyncedAt: invoice.lastSyncedAt,
        itemCount: invoice.lineItems?.length || 0
      }));
    } else {
      var routeStarPending = [];
    }

    const allPending = [...customerConnectPending, ...routeStarPending]
      .sort((a, b) => new Date(b.lastSyncedAt) - new Date(a.lastSyncedAt));

    res.status(200).json({
      success: true,
      data: {
        pending: allPending,
        counts: {
          customerConnect: customerConnectPending.length,
          routeStar: routeStarPending.length,
          total: allPending.length
        }
      }
    });
  } catch (error) {
    console.error('Get stock processing status error:', error);
    next(error);
  }
};

module.exports = {
  getDashboard,
  getStockSummary,
  getProfitMarginReport,
  getReorderList,
  getAuditLogs,
  getSalesReport,
  getInventoryValuation,
  getTopSellingItems,
  getCustomerReport,
  getLowStockReport,
  getProfitAnalysis,
  getRecentActivity,
  getInventorySyncHealth,
  exportReportToCSV,
  exportReportToPDF,
  getDashboardSyncWidget,
  getInventorySyncStatus,
  getSyncHistory,
  getStockProcessingStatus
};
