const SyncCustomerConnect = require('../services/sync/syncCustomerConnect');
const SyncRouteStar = require('../services/sync/syncRouteStar');
const SyncLog = require('../models/SyncLog');
const StockMovement = require('../models/StockMovement');
const PurchaseOrder = require('../models/PurchaseOrder');
const ExternalInvoice = require('../models/ExternalInvoice');
const StockProcessor = require('../services/stockProcessor');
const Inventory = require('../models/Inventory');






const syncCustomerConnect = async (req, res, next) => {
  try {
    const { limit = 50, processStock = true } = req.body;

    const syncService = new SyncCustomerConnect(req.user.id);
    const result = await syncService.run({ limit, processStock });

    res.status(200).json({
      success: true,
      message: 'CustomerConnect sync completed',
      data: result
    });
  } catch (error) {
    console.error('CustomerConnect sync error:', error);
    next(error);
  }
};






const syncRouteStar = async (req, res, next) => {
  try {
    const { limit = 50, processStock = true } = req.body;

    const syncService = new SyncRouteStar(req.user.id);
    const result = await syncService.run({ limit, processStock });

    res.status(200).json({
      success: true,
      message: 'RouteStar sync completed',
      data: result
    });
  } catch (error) {
    console.error('RouteStar sync error:', error);
    next(error);
  }
};






const getSyncLogs = async (req, res, next) => {
  try {
    const {
      source,
      status,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    if (source) query.source = source;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await SyncLog.countDocuments(query);

    const logs = await SyncLog.find(query)
      .populate('triggeredBy', 'username fullName')
      .sort({ startedAt: -1 })
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
    console.error('Get sync logs error:', error);
    next(error);
  }
};






const getSyncStatus = async (req, res, next) => {
  try {
    const customerConnectSync = await SyncLog.getLatestSync('customerconnect');
    const routeStarSync = await SyncLog.getLatestSync('routestar');

    res.status(200).json({
      success: true,
      data: {
        customerconnect: customerConnectSync,
        routestar: routeStarSync
      }
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    next(error);
  }
};






const getSyncStats = async (req, res, next) => {
  try {
    const { source, days = 30 } = req.query;

    if (!source) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Source parameter is required',
          code: 'SOURCE_REQUIRED'
        }
      });
    }

    const stats = await SyncLog.getSyncStats(source, parseInt(days));

    res.status(200).json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get sync stats error:', error);
    next(error);
  }
};






const getSyncHealth = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    
    const customerConnectSyncs = await SyncLog.find({
      source: 'customerconnect',
      startedAt: { $gte: startDate }
    }).sort({ startedAt: -1 });

    const routeStarSyncs = await SyncLog.find({
      source: 'routestar',
      startedAt: { $gte: startDate }
    }).sort({ startedAt: -1 });

    
    const ccHealth = calculateHealthMetrics(customerConnectSyncs);
    const rsHealth = calculateHealthMetrics(routeStarSyncs);

    
    const unprocessedPurchaseOrders = await PurchaseOrder.countDocuments({
      stockProcessed: false,
      status: { $in: ['confirmed', 'received', 'completed'] }
    });

    const unprocessedInvoices = await ExternalInvoice.countDocuments({
      stockProcessed: false,
      status: { $in: ['paid', 'delivered', 'completed'] }
    });

    
    const failedMovements = await StockMovement.countDocuments({
      error: { $exists: true, $ne: null }
    });

    
    const overallHealth = determineOverallHealth(ccHealth, rsHealth, unprocessedPurchaseOrders, unprocessedInvoices);

    res.status(200).json({
      success: true,
      data: {
        overall: {
          status: overallHealth.status,
          healthScore: overallHealth.score,
          lastChecked: new Date()
        },
        customerconnect: {
          ...ccHealth,
          unprocessedOrders: unprocessedPurchaseOrders,
          latestSync: customerConnectSyncs[0] || null
        },
        routestar: {
          ...rsHealth,
          unprocessedInvoices: unprocessedInvoices,
          latestSync: routeStarSyncs[0] || null
        },
        stockProcessing: {
          unprocessedPurchaseOrders,
          unprocessedInvoices,
          failedMovements,
          status: (unprocessedPurchaseOrders > 10 || unprocessedInvoices > 10) ? 'warning' : 'healthy'
        },
        period: {
          days: parseInt(days),
          startDate,
          endDate: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Get sync health error:', error);
    next(error);
  }
};




const calculateHealthMetrics = (syncs) => {
  if (syncs.length === 0) {
    return {
      status: 'no_data',
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      partialSyncs: 0,
      successRate: 0,
      averageDuration: 0,
      averageRecordsProcessed: 0
    };
  }

  const successfulSyncs = syncs.filter(s => s.status === 'SUCCESS').length;
  const failedSyncs = syncs.filter(s => s.status === 'FAILED').length;
  const partialSyncs = syncs.filter(s => s.status === 'PARTIAL').length;
  const successRate = (successfulSyncs / syncs.length) * 100;

  const completedSyncs = syncs.filter(s => s.endedAt);
  const averageDuration = completedSyncs.length > 0
    ? completedSyncs.reduce((sum, s) => sum + (s.endedAt - s.startedAt), 0) / completedSyncs.length
    : 0;

  const averageRecordsProcessed = syncs.length > 0
    ? syncs.reduce((sum, s) => sum + (s.recordsInserted + s.recordsUpdated), 0) / syncs.length
    : 0;

  let status = 'healthy';
  if (successRate < 50) status = 'critical';
  else if (successRate < 80) status = 'warning';

  return {
    status,
    totalSyncs: syncs.length,
    successfulSyncs,
    failedSyncs,
    partialSyncs,
    successRate: Math.round(successRate * 100) / 100,
    averageDuration: Math.round(averageDuration),
    averageRecordsProcessed: Math.round(averageRecordsProcessed * 100) / 100
  };
};




const determineOverallHealth = (ccHealth, rsHealth, unprocessedPOs, unprocessedInvoices) => {
  const ccScore = calculateHealthScore(ccHealth);
  const rsScore = calculateHealthScore(rsHealth);
  const stockScore = 100 - Math.min((unprocessedPOs + unprocessedInvoices) * 2, 50);

  const overallScore = (ccScore + rsScore + stockScore) / 3;

  let status = 'healthy';
  if (overallScore < 50) status = 'critical';
  else if (overallScore < 75) status = 'warning';

  return {
    status,
    score: Math.round(overallScore * 100) / 100
  };
};




const calculateHealthScore = (health) => {
  if (health.status === 'no_data') return 50;

  const successRateWeight = 0.7;
  const performanceWeight = 0.3;

  const successScore = health.successRate;
  const performanceScore = health.averageDuration < 60000 ? 100 :
                          health.averageDuration < 120000 ? 80 :
                          health.averageDuration < 300000 ? 60 : 40;

  return (successScore * successRateWeight) + (performanceScore * performanceWeight);
};






const retryFailedSyncs = async (req, res, next) => {
  try {
    const { source, syncLogId, hours = 24 } = req.body;

    if (!source && !syncLogId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Either source or syncLogId is required',
          code: 'MISSING_PARAMETERS'
        }
      });
    }

    let results = {
      attempted: 0,
      successful: 0,
      failed: 0,
      syncs: []
    };

    
    if (syncLogId) {
      const syncLog = await SyncLog.findById(syncLogId);

      if (!syncLog) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Sync log not found',
            code: 'SYNC_NOT_FOUND'
          }
        });
      }

      if (syncLog.status !== 'FAILED' && syncLog.status !== 'PARTIAL') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Only failed or partial syncs can be retried',
            code: 'INVALID_SYNC_STATUS'
          }
        });
      }

      const retryResult = await retrySingleSync(syncLog, req.user.id);
      results.attempted = 1;
      if (retryResult.success) {
        results.successful = 1;
      } else {
        results.failed = 1;
      }
      results.syncs.push(retryResult);

    } else {
      
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - parseInt(hours));

      const failedSyncs = await SyncLog.find({
        source,
        status: { $in: ['FAILED', 'PARTIAL'] },
        startedAt: { $gte: startDate }
      }).sort({ startedAt: 1 });

      results.attempted = failedSyncs.length;

      for (const syncLog of failedSyncs) {
        const retryResult = await retrySingleSync(syncLog, req.user.id);
        if (retryResult.success) {
          results.successful++;
        } else {
          results.failed++;
        }
        results.syncs.push(retryResult);
      }
    }

    res.status(200).json({
      success: true,
      message: `Retry completed: ${results.successful} successful, ${results.failed} failed out of ${results.attempted} attempted`,
      data: results
    });
  } catch (error) {
    console.error('Retry failed syncs error:', error);
    next(error);
  }
};




const retrySingleSync = async (syncLog, userId) => {
  try {
    let syncService;

    if (syncLog.source === 'customerconnect') {
      syncService = new SyncCustomerConnect(userId);
    } else if (syncLog.source === 'routestar') {
      syncService = new SyncRouteStar(userId);
    } else {
      return {
        syncLogId: syncLog._id,
        source: syncLog.source,
        success: false,
        error: 'Unknown sync source'
      };
    }

    const result = await syncService.run({
      limit: syncLog.details?.limit || 50,
      processStock: true
    });

    return {
      syncLogId: syncLog._id,
      source: syncLog.source,
      success: true,
      newSyncLog: result
    };
  } catch (error) {
    console.error(`Error retrying sync ${syncLog._id}:`, error);
    return {
      syncLogId: syncLog._id,
      source: syncLog.source,
      success: false,
      error: error.message
    };
  }
};






const reprocessFailedStock = async (req, res, next) => {
  try {
    const { source, type, recordIds, all = false } = req.body;

    let results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    
    if (recordIds && recordIds.length > 0) {
      for (const recordId of recordIds) {
        try {
          if (type === 'purchase_order' || !type) {
            const po = await PurchaseOrder.findById(recordId);
            if (po && !po.stockProcessed) {
              await StockProcessor.processPurchaseOrder(po, req.user.id);
              results.successful++;
            }
            results.processed++;
          }

          if (type === 'invoice' || !type) {
            const invoice = await ExternalInvoice.findById(recordId);
            if (invoice && !invoice.stockProcessed) {
              await StockProcessor.processInvoice(invoice, req.user.id);
              results.successful++;
            }
            results.processed++;
          }
        } catch (error) {
          console.error(`Error processing record ${recordId}:`, error);
          results.failed++;
          results.errors.push({
            recordId,
            error: error.message
          });
        }
      }
    }
    
    else if (all) {
      try {
        if (type === 'purchase_order' || !type) {
          const query = { stockProcessed: false };
          if (source) query.source = source;

          const unprocessedPOs = await PurchaseOrder.find(query);
          results.processed += unprocessedPOs.length;

          for (const po of unprocessedPOs) {
            try {
              await StockProcessor.processPurchaseOrder(po, req.user.id);
              results.successful++;
            } catch (error) {
              console.error(`Error processing PO ${po.orderNumber}:`, error);
              results.failed++;
              results.errors.push({
                recordId: po._id,
                orderNumber: po.orderNumber,
                error: error.message
              });
            }
          }
        }

        if (type === 'invoice' || !type) {
          const query = { stockProcessed: false };
          if (source) query.source = source;

          const unprocessedInvoices = await ExternalInvoice.find(query);
          results.processed += unprocessedInvoices.length;

          for (const invoice of unprocessedInvoices) {
            try {
              await StockProcessor.processInvoice(invoice, req.user.id);
              results.successful++;
            } catch (error) {
              console.error(`Error processing invoice ${invoice.invoiceNumber}:`, error);
              results.failed++;
              results.errors.push({
                recordId: invoice._id,
                invoiceNumber: invoice.invoiceNumber,
                error: error.message
              });
            }
          }
        }
      } catch (error) {
        console.error('Error processing all records:', error);
        throw error;
      }
    } else {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Either recordIds or all=true must be provided',
          code: 'MISSING_PARAMETERS'
        }
      });
    }

    res.status(200).json({
      success: true,
      message: `Reprocessed ${results.successful} records successfully, ${results.failed} failed out of ${results.processed} total`,
      data: results
    });
  } catch (error) {
    console.error('Reprocess failed stock error:', error);
    next(error);
  }
};






const getSyncPerformanceMetrics = async (req, res, next) => {
  try {
    const { source, days = 30 } = req.query;

    if (!source) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Source parameter is required',
          code: 'SOURCE_REQUIRED'
        }
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    
    const syncs = await SyncLog.find({
      source,
      startedAt: { $gte: startDate }
    }).sort({ startedAt: 1 });

    if (syncs.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          source,
          period: { days: parseInt(days), startDate, endDate: new Date() },
          metrics: null,
          message: 'No sync data available for the specified period'
        }
      });
    }

    
    const completedSyncs = syncs.filter(s => s.endedAt);
    const successfulSyncs = syncs.filter(s => s.status === 'SUCCESS');
    const failedSyncs = syncs.filter(s => s.status === 'FAILED');
    const partialSyncs = syncs.filter(s => s.status === 'PARTIAL');

    const durations = completedSyncs.map(s => s.endedAt - s.startedAt);
    const avgDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

    const totalRecordsFound = syncs.reduce((sum, s) => sum + (s.recordsFound || 0), 0);
    const totalRecordsInserted = syncs.reduce((sum, s) => sum + (s.recordsInserted || 0), 0);
    const totalRecordsUpdated = syncs.reduce((sum, s) => sum + (s.recordsUpdated || 0), 0);
    const totalRecordsFailed = syncs.reduce((sum, s) => sum + (s.recordsFailed || 0), 0);

    const avgRecordsPerSync = syncs.length > 0
      ? (totalRecordsInserted + totalRecordsUpdated) / syncs.length
      : 0;

    const recordsPerMinute = avgDuration > 0
      ? (avgRecordsPerSync / (avgDuration / 60000))
      : 0;

    
    const dailyBreakdown = calculateDailyBreakdown(syncs);

    
    const hourlyPerformance = calculateHourlyPerformance(syncs);

    const metrics = {
      overview: {
        totalSyncs: syncs.length,
        successfulSyncs: successfulSyncs.length,
        failedSyncs: failedSyncs.length,
        partialSyncs: partialSyncs.length,
        successRate: (successfulSyncs.length / syncs.length) * 100,
        failureRate: (failedSyncs.length / syncs.length) * 100
      },
      duration: {
        average: Math.round(avgDuration),
        minimum: Math.round(minDuration),
        maximum: Math.round(maxDuration),
        unit: 'milliseconds'
      },
      throughput: {
        totalRecordsFound,
        totalRecordsInserted,
        totalRecordsUpdated,
        totalRecordsFailed,
        averageRecordsPerSync: Math.round(avgRecordsPerSync * 100) / 100,
        recordsPerMinute: Math.round(recordsPerMinute * 100) / 100
      },
      reliability: {
        successRate: Math.round((successfulSyncs.length / syncs.length) * 10000) / 100,
        partialRate: Math.round((partialSyncs.length / syncs.length) * 10000) / 100,
        failureRate: Math.round((failedSyncs.length / syncs.length) * 10000) / 100,
        mtbf: calculateMTBF(syncs), 
        consistency: calculateConsistency(syncs)
      },
      trends: {
        dailyBreakdown,
        hourlyPerformance,
        recentTrend: calculateRecentTrend(syncs)
      }
    };

    res.status(200).json({
      success: true,
      data: {
        source,
        period: {
          days: parseInt(days),
          startDate,
          endDate: new Date()
        },
        metrics
      }
    });
  } catch (error) {
    console.error('Get sync performance metrics error:', error);
    next(error);
  }
};




const calculateDailyBreakdown = (syncs) => {
  const breakdown = {};

  syncs.forEach(sync => {
    const date = sync.startedAt.toISOString().split('T')[0];
    if (!breakdown[date]) {
      breakdown[date] = {
        date,
        total: 0,
        successful: 0,
        failed: 0,
        partial: 0,
        recordsProcessed: 0
      };
    }

    breakdown[date].total++;
    if (sync.status === 'SUCCESS') breakdown[date].successful++;
    if (sync.status === 'FAILED') breakdown[date].failed++;
    if (sync.status === 'PARTIAL') breakdown[date].partial++;
    breakdown[date].recordsProcessed += (sync.recordsInserted || 0) + (sync.recordsUpdated || 0);
  });

  return Object.values(breakdown).sort((a, b) => a.date.localeCompare(b.date));
};




const calculateHourlyPerformance = (syncs) => {
  const hourlyStats = {};

  syncs.forEach(sync => {
    const hour = sync.startedAt.getHours();
    if (!hourlyStats[hour]) {
      hourlyStats[hour] = {
        hour,
        count: 0,
        successful: 0,
        avgDuration: 0,
        durations: []
      };
    }

    hourlyStats[hour].count++;
    if (sync.status === 'SUCCESS') hourlyStats[hour].successful++;
    if (sync.endedAt) {
      hourlyStats[hour].durations.push(sync.endedAt - sync.startedAt);
    }
  });

  
  Object.keys(hourlyStats).forEach(hour => {
    const stats = hourlyStats[hour];
    if (stats.durations.length > 0) {
      stats.avgDuration = Math.round(
        stats.durations.reduce((sum, d) => sum + d, 0) / stats.durations.length
      );
    }
    delete stats.durations;
  });

  return Object.values(hourlyStats).sort((a, b) => a.hour - b.hour);
};




const calculateMTBF = (syncs) => {
  const failures = syncs.filter(s => s.status === 'FAILED');
  if (failures.length <= 1) return Infinity;

  const intervals = [];
  for (let i = 1; i < failures.length; i++) {
    intervals.push(failures[i].startedAt - failures[i - 1].startedAt);
  }

  const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
  return Math.round(avgInterval / 1000 / 60); 
};




const calculateConsistency = (syncs) => {
  if (syncs.length < 2) return 100;

  const completedSyncs = syncs.filter(s => s.endedAt);
  if (completedSyncs.length < 2) return 100;

  const durations = completedSyncs.map(s => s.endedAt - s.startedAt);
  const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;

  
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  
  const cv = avg > 0 ? (stdDev / avg) : 0;

  
  const consistencyScore = Math.max(0, Math.min(100, 100 - (cv * 100)));

  return Math.round(consistencyScore * 100) / 100;
};




const calculateRecentTrend = (syncs) => {
  if (syncs.length < 4) return 'stable';

  const halfPoint = Math.floor(syncs.length / 2);
  const firstHalf = syncs.slice(0, halfPoint);
  const secondHalf = syncs.slice(halfPoint);

  const firstHalfSuccess = firstHalf.filter(s => s.status === 'SUCCESS').length / firstHalf.length;
  const secondHalfSuccess = secondHalf.filter(s => s.status === 'SUCCESS').length / secondHalf.length;

  const difference = secondHalfSuccess - firstHalfSuccess;

  if (difference > 0.1) return 'improving';
  if (difference < -0.1) return 'degrading';
  return 'stable';
};






const getInventoryAnalytics = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    
    const stockMovementStats = await StockMovement.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          totalMovements: { $sum: 1 },
          totalQuantity: { $sum: '$qty' },
          uniqueSKUs: { $addToSet: '$sku' }
        }
      }
    ]);

    
    const syncDrivenChanges = await StockMovement.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
          refType: { $in: ['PURCHASE_ORDER', 'INVOICE'] }
        }
      },
      {
        $group: {
          _id: '$refType',
          count: { $sum: 1 },
          totalQty: { $sum: '$qty' }
        }
      }
    ]);

    
    const topMovingSKUs = await StockMovement.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$sku',
          totalMovements: { $sum: 1 },
          inQty: {
            $sum: {
              $cond: [{ $eq: ['$type', 'IN'] }, '$qty', 0]
            }
          },
          outQty: {
            $sum: {
              $cond: [{ $eq: ['$type', 'OUT'] }, '$qty', 0]
            }
          }
        }
      },
      {
        $sort: { totalMovements: -1 }
      },
      {
        $limit: 10
      }
    ]);

    
    const lowStockItems = await Inventory.find({ isActive: true, isDeleted: false })
      .select('skuCode itemName quantity')
      .lean();

    const lowStock = lowStockItems
      .filter(item => item.quantity?.current <= item.quantity?.minimum)
      .map(item => ({
        sku: item.skuCode,
        name: item.itemName,
        current: item.quantity?.current || 0,
        minimum: item.quantity?.minimum || 0,
        deficit: (item.quantity?.minimum || 0) - (item.quantity?.current || 0)
      }))
      .sort((a, b) => b.deficit - a.deficit)
      .slice(0, 20);

    
    const customerConnectOrders = await PurchaseOrder.countDocuments({
      stockProcessed: true,
      stockProcessedAt: { $gte: startDate }
    });

    const routeStarInvoices = await ExternalInvoice.countDocuments({
      stockProcessed: true,
      stockProcessedAt: { $gte: startDate }
    });

    
    const inventoryTurnover = await calculateInventoryTurnover(startDate);

    res.status(200).json({
      success: true,
      data: {
        period: {
          days: parseInt(days),
          startDate,
          endDate: new Date()
        },
        stockMovements: {
          summary: stockMovementStats.map(stat => ({
            type: stat._id,
            totalMovements: stat.totalMovements,
            totalQuantity: stat.totalQuantity,
            uniqueSKUs: stat.uniqueSKUs.length
          })),
          syncDriven: syncDrivenChanges
        },
        topMovingSKUs,
        lowStockItems: {
          count: lowStock.length,
          items: lowStock
        },
        syncImpact: {
          customerConnectOrders,
          routeStarInvoices,
          totalSyncDrivenChanges: customerConnectOrders + routeStarInvoices
        },
        inventoryTurnover
      }
    });
  } catch (error) {
    console.error('Get inventory analytics error:', error);
    next(error);
  }
};




const calculateInventoryTurnover = async (startDate) => {
  try {
    const totalOut = await StockMovement.aggregate([
      {
        $match: {
          type: 'OUT',
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalQty: { $sum: '$qty' }
        }
      }
    ]);

    const totalInventory = await Inventory.aggregate([
      {
        $match: {
          isActive: true,
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalQty: { $sum: '$quantity.current' }
        }
      }
    ]);

    const outQty = totalOut.length > 0 ? totalOut[0].totalQty : 0;
    const avgInventory = totalInventory.length > 0 ? totalInventory[0].totalQty : 0;

    const turnoverRate = avgInventory > 0 ? (outQty / avgInventory) : 0;

    return {
      totalOut: outQty,
      averageInventory: avgInventory,
      turnoverRate: Math.round(turnoverRate * 100) / 100,
      annualizedTurnover: Math.round(turnoverRate * (365 / ((new Date() - startDate) / (1000 * 60 * 60 * 24))) * 100) / 100
    };
  } catch (error) {
    console.error('Error calculating inventory turnover:', error);
    return null;
  }
};

module.exports = {
  syncCustomerConnect,
  syncRouteStar,
  getSyncLogs,
  getSyncStatus,
  getSyncStats,
  getSyncHealth,
  retryFailedSyncs,
  reprocessFailedStock,
  getSyncPerformanceMetrics,
  getInventoryAnalytics
};
