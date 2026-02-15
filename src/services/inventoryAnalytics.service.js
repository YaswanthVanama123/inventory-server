const db = require('../config/database');










async function getSyncHealthStatus() {
  try {
    const [healthMetrics] = await db.query(`
      SELECT
        COUNT(*) as total_items,
        SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced_count,
        SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN sync_status = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN last_sync_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as synced_24h,
        SUM(CASE WHEN last_sync_date < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as stale_items,
        AVG(CASE WHEN sync_status = 'synced' THEN
          TIMESTAMPDIFF(SECOND, updated_at, last_sync_date)
        END) as avg_sync_time_seconds
      FROM inventory_items
      WHERE deleted_at IS NULL
    `);

    const [recentSyncActivity] = await db.query(`
      SELECT
        DATE(last_sync_date) as sync_date,
        COUNT(*) as sync_count,
        SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as successful_syncs,
        SUM(CASE WHEN sync_status = 'failed' OR sync_status = 'error' THEN 1 ELSE 0 END) as failed_syncs
      FROM inventory_items
      WHERE last_sync_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND deleted_at IS NULL
      GROUP BY DATE(last_sync_date)
      ORDER BY sync_date DESC
      LIMIT 7
    `);

    const metrics = healthMetrics[0];
    const syncRate = metrics.total_items > 0
      ? ((metrics.synced_count / metrics.total_items) * 100).toFixed(2)
      : 0;

    const errorRate = metrics.total_items > 0
      ? (((metrics.failed_count + metrics.error_count) / metrics.total_items) * 100).toFixed(2)
      : 0;

    const healthStatus = errorRate < 5 ? 'healthy' : errorRate < 15 ? 'warning' : 'critical';

    return {
      status: healthStatus,
      metrics: {
        total_items: metrics.total_items,
        synced_count: metrics.synced_count,
        pending_count: metrics.pending_count,
        failed_count: metrics.failed_count,
        error_count: metrics.error_count,
        synced_last_24h: metrics.synced_24h,
        stale_items: metrics.stale_items,
        sync_rate_percentage: parseFloat(syncRate),
        error_rate_percentage: parseFloat(errorRate),
        avg_sync_time_seconds: parseFloat(metrics.avg_sync_time_seconds || 0).toFixed(2)
      },
      recent_activity: recentSyncActivity,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting sync health status:', error);
    throw error;
  }
}









async function getStockMovementAnalytics(options = {}) {
  try {
    const { start_date, end_date, item_id } = options;

    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end_date || new Date();

    let itemFilter = '';
    let params = [startDate, endDate];

    if (item_id) {
      itemFilter = 'AND sm.item_id = ?';
      params.push(item_id);
    }

    const [movementStats] = await db.query(`
      SELECT
        COUNT(*) as total_movements,
        SUM(CASE WHEN movement_type = 'in' THEN 1 ELSE 0 END) as total_inbound,
        SUM(CASE WHEN movement_type = 'out' THEN 1 ELSE 0 END) as total_outbound,
        SUM(CASE WHEN movement_type = 'adjustment' THEN 1 ELSE 0 END) as total_adjustments,
        SUM(CASE WHEN movement_type = 'in' THEN quantity ELSE 0 END) as total_quantity_in,
        SUM(CASE WHEN movement_type = 'out' THEN quantity ELSE 0 END) as total_quantity_out,
        SUM(CASE WHEN movement_type = 'adjustment' THEN quantity ELSE 0 END) as total_quantity_adjusted,
        SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced_movements,
        SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) as pending_movements,
        SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) as failed_movements,
        AVG(quantity) as avg_movement_quantity,
        MAX(quantity) as max_movement_quantity,
        MIN(quantity) as min_movement_quantity
      FROM stock_movements sm
      WHERE sm.movement_date BETWEEN ? AND ?
        ${itemFilter}
        AND sm.deleted_at IS NULL
    `, params);

    const [movementsByDay] = await db.query(`
      SELECT
        DATE(movement_date) as movement_day,
        movement_type,
        COUNT(*) as movement_count,
        SUM(quantity) as total_quantity
      FROM stock_movements
      WHERE movement_date BETWEEN ? AND ?
        ${itemFilter}
        AND deleted_at IS NULL
      GROUP BY DATE(movement_date), movement_type
      ORDER BY movement_day DESC, movement_type
    `, params);

    const [topMovingItems] = await db.query(`
      SELECT
        sm.item_id,
        ii.item_name,
        ii.sku,
        COUNT(*) as movement_count,
        SUM(sm.quantity) as total_quantity_moved,
        SUM(CASE WHEN sm.movement_type = 'in' THEN sm.quantity ELSE 0 END) as quantity_in,
        SUM(CASE WHEN sm.movement_type = 'out' THEN sm.quantity ELSE 0 END) as quantity_out
      FROM stock_movements sm
      JOIN inventory_items ii ON sm.item_id = ii.id
      WHERE sm.movement_date BETWEEN ? AND ?
        ${itemFilter}
        AND sm.deleted_at IS NULL
      GROUP BY sm.item_id, ii.item_name, ii.sku
      ORDER BY movement_count DESC
      LIMIT 10
    `, params);

    const [movementsBySource] = await db.query(`
      SELECT
        source,
        COUNT(*) as movement_count,
        SUM(quantity) as total_quantity,
        AVG(quantity) as avg_quantity
      FROM stock_movements
      WHERE movement_date BETWEEN ? AND ?
        ${itemFilter}
        AND deleted_at IS NULL
      GROUP BY source
      ORDER BY movement_count DESC
    `, params);

    return {
      summary: movementStats[0],
      daily_trends: movementsByDay,
      top_moving_items: topMovingItems,
      movements_by_source: movementsBySource,
      period: {
        start_date: startDate,
        end_date: endDate
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting stock movement analytics:', error);
    throw error;
  }
}








async function getSyncTrends(options = {}) {
  try {
    const { days = 30, granularity = 'day' } = options;

    let dateFormat, dateGroup, intervalValue;

    switch (granularity) {
      case 'hour':
        dateFormat = '%Y-%m-%d %H:00:00';
        dateGroup = 'DATE_FORMAT(last_sync_date, "%Y-%m-%d %H:00:00")';
        intervalValue = days;
        break;
      case 'week':
        dateFormat = '%Y-%U';
        dateGroup = 'YEARWEEK(last_sync_date)';
        intervalValue = days;
        break;
      case 'day':
      default:
        dateFormat = '%Y-%m-%d';
        dateGroup = 'DATE(last_sync_date)';
        intervalValue = days;
        break;
    }

    const [syncTrends] = await db.query(`
      SELECT
        DATE_FORMAT(last_sync_date, '${dateFormat}') as period,
        COUNT(*) as total_syncs,
        SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as successful_syncs,
        SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) as failed_syncs,
        SUM(CASE WHEN sync_status = 'error' THEN 1 ELSE 0 END) as error_syncs,
        SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) as pending_syncs,
        AVG(CASE WHEN sync_status = 'synced' THEN
          TIMESTAMPDIFF(SECOND, updated_at, last_sync_date)
        END) as avg_sync_duration_seconds
      FROM inventory_items
      WHERE last_sync_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
      GROUP BY ${dateGroup}
      ORDER BY period DESC
    `, [intervalValue]);

    const [stockMovementTrends] = await db.query(`
      SELECT
        DATE_FORMAT(last_synced_at, '${dateFormat}') as period,
        COUNT(*) as total_movements_synced,
        SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as successful_movement_syncs,
        SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) as failed_movement_syncs
      FROM stock_movements
      WHERE last_synced_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
      GROUP BY ${dateGroup}
      ORDER BY period DESC
    `, [intervalValue]);

    const [performanceMetrics] = await db.query(`
      SELECT
        AVG(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) * 100 as avg_success_rate,
        AVG(CASE WHEN last_sync_date >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) * 100 as daily_sync_coverage,
        COUNT(DISTINCT DATE(last_sync_date)) as active_sync_days
      FROM inventory_items
      WHERE last_sync_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
    `, [intervalValue]);

    return {
      inventory_sync_trends: syncTrends,
      stock_movement_sync_trends: stockMovementTrends,
      performance_metrics: {
        avg_success_rate: parseFloat(performanceMetrics[0].avg_success_rate || 0).toFixed(2),
        daily_sync_coverage: parseFloat(performanceMetrics[0].daily_sync_coverage || 0).toFixed(2),
        active_sync_days: performanceMetrics[0].active_sync_days
      },
      configuration: {
        days,
        granularity
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting sync trends:', error);
    throw error;
  }
}










async function getUnprocessedRecords(options = {}) {
  try {
    const {
      limit = 100,
      offset = 0,
      order_by = 'movement_date',
      order_direction = 'DESC'
    } = options;

    const validOrderFields = ['movement_date', 'created_at', 'quantity', 'item_id'];
    const orderField = validOrderFields.includes(order_by) ? order_by : 'movement_date';
    const orderDir = order_direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const [totalCount] = await db.query(`
      SELECT COUNT(*) as total
      FROM stock_movements
      WHERE sync_status IN ('pending', 'failed')
        AND deleted_at IS NULL
    `);

    const [unprocessedMovements] = await db.query(`
      SELECT
        sm.id,
        sm.item_id,
        ii.item_name,
        ii.sku,
        sm.movement_type,
        sm.quantity,
        sm.movement_date,
        sm.source,
        sm.reference_number,
        sm.sync_status,
        sm.sync_error_message,
        sm.sync_attempts,
        sm.created_at,
        sm.updated_at,
        TIMESTAMPDIFF(HOUR, sm.created_at, NOW()) as hours_pending
      FROM stock_movements sm
      LEFT JOIN inventory_items ii ON sm.item_id = ii.id
      WHERE sm.sync_status IN ('pending', 'failed')
        AND sm.deleted_at IS NULL
      ORDER BY sm.${orderField} ${orderDir}
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const [pendingByType] = await db.query(`
      SELECT
        movement_type,
        COUNT(*) as count,
        SUM(quantity) as total_quantity
      FROM stock_movements
      WHERE sync_status IN ('pending', 'failed')
        AND deleted_at IS NULL
      GROUP BY movement_type
    `);

    const [pendingBySource] = await db.query(`
      SELECT
        source,
        COUNT(*) as count,
        AVG(sync_attempts) as avg_attempts
      FROM stock_movements
      WHERE sync_status IN ('pending', 'failed')
        AND deleted_at IS NULL
      GROUP BY source
    `);

    const [oldestPending] = await db.query(`
      SELECT
        MIN(created_at) as oldest_pending_date,
        MAX(sync_attempts) as max_attempts
      FROM stock_movements
      WHERE sync_status IN ('pending', 'failed')
        AND deleted_at IS NULL
    `);

    return {
      total_count: totalCount[0].total,
      records: unprocessedMovements,
      summary: {
        by_movement_type: pendingByType,
        by_source: pendingBySource,
        oldest_pending_date: oldestPending[0].oldest_pending_date,
        max_sync_attempts: oldestPending[0].max_attempts
      },
      pagination: {
        limit,
        offset,
        has_more: (offset + limit) < totalCount[0].total
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting unprocessed records:', error);
    throw error;
  }
}







async function getInventorySourceBreakdown(options = {}) {
  try {
    const { include_details = false } = options;

    const [sourceBreakdown] = await db.query(`
      SELECT
        source,
        COUNT(*) as total_items,
        SUM(quantity) as total_quantity,
        SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced_items,
        SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) as pending_items,
        SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) as failed_items,
        AVG(quantity) as avg_quantity,
        MAX(last_sync_date) as last_sync_date,
        MIN(created_at) as first_item_created
      FROM inventory_items
      WHERE deleted_at IS NULL
      GROUP BY source
      ORDER BY total_items DESC
    `);

    const [stockMovementsBySource] = await db.query(`
      SELECT
        source,
        COUNT(*) as total_movements,
        SUM(CASE WHEN movement_type = 'in' THEN quantity ELSE 0 END) as total_quantity_in,
        SUM(CASE WHEN movement_type = 'out' THEN quantity ELSE 0 END) as total_quantity_out,
        SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced_movements
      FROM stock_movements
      WHERE deleted_at IS NULL
        AND movement_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY source
      ORDER BY total_movements DESC
    `);

    const [categoryBySource] = await db.query(`
      SELECT
        ii.source,
        ii.category,
        COUNT(*) as item_count,
        SUM(ii.quantity) as total_quantity
      FROM inventory_items ii
      WHERE ii.deleted_at IS NULL
        AND ii.category IS NOT NULL
      GROUP BY ii.source, ii.category
      ORDER BY ii.source, item_count DESC
    `);

    let itemDetails = {};
    if (include_details) {
      const [customerConnectItems] = await db.query(`
        SELECT id, item_name, sku, quantity, sync_status, last_sync_date
        FROM inventory_items
        WHERE source = 'CustomerConnect' AND deleted_at IS NULL
        ORDER BY quantity DESC
        LIMIT 50
      `);

      const [routeStarItems] = await db.query(`
        SELECT id, item_name, sku, quantity, sync_status, last_sync_date
        FROM inventory_items
        WHERE source = 'RouteStar' AND deleted_at IS NULL
        ORDER BY quantity DESC
        LIMIT 50
      `);

      const [manualItems] = await db.query(`
        SELECT id, item_name, sku, quantity, sync_status, last_sync_date
        FROM inventory_items
        WHERE source = 'Manual' AND deleted_at IS NULL
        ORDER BY quantity DESC
        LIMIT 50
      `);

      itemDetails = {
        CustomerConnect: customerConnectItems,
        RouteStar: routeStarItems,
        Manual: manualItems
      };
    }

    const totalItems = sourceBreakdown.reduce((sum, item) => sum + item.total_items, 0);
    const sourcePercentages = sourceBreakdown.map(source => ({
      ...source,
      percentage_of_total: totalItems > 0
        ? ((source.total_items / totalItems) * 100).toFixed(2)
        : 0,
      sync_rate: source.total_items > 0
        ? ((source.synced_items / source.total_items) * 100).toFixed(2)
        : 0
    }));

    return {
      source_breakdown: sourcePercentages,
      stock_movements_by_source: stockMovementsBySource,
      category_distribution: categoryBySource,
      ...(include_details && { item_details: itemDetails }),
      summary: {
        total_items: totalItems,
        total_sources: sourceBreakdown.length
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting inventory source breakdown:', error);
    throw error;
  }
}








async function getSyncErrorAnalysis(options = {}) {
  try {
    const { days = 7, limit = 50 } = options;

    const [errorSummary] = await db.query(`
      SELECT
        COUNT(*) as total_errors,
        COUNT(DISTINCT item_id) as affected_items,
        MAX(updated_at) as last_error_date,
        AVG(sync_attempts) as avg_retry_attempts
      FROM inventory_items
      WHERE sync_status IN ('failed', 'error')
        AND updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
    `, [days]);

    const [errorsByType] = await db.query(`
      SELECT
        CASE
          WHEN sync_error_message LIKE '%timeout%' THEN 'Timeout'
          WHEN sync_error_message LIKE '%connection%' THEN 'Connection Error'
          WHEN sync_error_message LIKE '%authentication%' OR sync_error_message LIKE '%auth%' THEN 'Authentication Error'
          WHEN sync_error_message LIKE '%validation%' THEN 'Validation Error'
          WHEN sync_error_message LIKE '%not found%' OR sync_error_message LIKE '%404%' THEN 'Not Found'
          WHEN sync_error_message LIKE '%duplicate%' THEN 'Duplicate Entry'
          WHEN sync_error_message IS NULL THEN 'Unknown Error'
          ELSE 'Other Error'
        END as error_type,
        COUNT(*) as error_count,
        COUNT(DISTINCT item_id) as unique_items
      FROM inventory_items
      WHERE sync_status IN ('failed', 'error')
        AND updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
      GROUP BY error_type
      ORDER BY error_count DESC
    `, [days]);

    const [errorsBySource] = await db.query(`
      SELECT
        source,
        COUNT(*) as error_count,
        AVG(sync_attempts) as avg_attempts,
        MAX(updated_at) as last_error
      FROM inventory_items
      WHERE sync_status IN ('failed', 'error')
        AND updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
      GROUP BY source
      ORDER BY error_count DESC
    `, [days]);

    const [recentErrors] = await db.query(`
      SELECT
        ii.id,
        ii.item_name,
        ii.sku,
        ii.source,
        ii.sync_status,
        ii.sync_error_message,
        ii.sync_attempts,
        ii.last_sync_date,
        ii.updated_at
      FROM inventory_items ii
      WHERE ii.sync_status IN ('failed', 'error')
        AND ii.updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND ii.deleted_at IS NULL
      ORDER BY ii.updated_at DESC
      LIMIT ?
    `, [days, limit]);

    const [stockMovementErrors] = await db.query(`
      SELECT
        COUNT(*) as total_movement_errors,
        COUNT(DISTINCT item_id) as affected_items,
        MAX(updated_at) as last_error_date
      FROM stock_movements
      WHERE sync_status = 'failed'
        AND updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
    `, [days]);

    const [movementErrorsByType] = await db.query(`
      SELECT
        movement_type,
        source,
        COUNT(*) as error_count,
        AVG(sync_attempts) as avg_attempts
      FROM stock_movements
      WHERE sync_status = 'failed'
        AND updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
      GROUP BY movement_type, source
      ORDER BY error_count DESC
    `);

    const [errorTrends] = await db.query(`
      SELECT
        DATE(updated_at) as error_date,
        COUNT(*) as error_count,
        COUNT(DISTINCT item_id) as unique_items
      FROM inventory_items
      WHERE sync_status IN ('failed', 'error')
        AND updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
      GROUP BY DATE(updated_at)
      ORDER BY error_date DESC
    `, [days]);

    return {
      inventory_errors: {
        summary: errorSummary[0],
        by_type: errorsByType,
        by_source: errorsBySource,
        recent_errors: recentErrors,
        error_trends: errorTrends
      },
      stock_movement_errors: {
        summary: stockMovementErrors[0],
        by_type_and_source: movementErrorsByType
      },
      analysis_period: {
        days,
        start_date: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting sync error analysis:', error);
    throw error;
  }
}

module.exports = {
  getSyncHealthStatus,
  getStockMovementAnalytics,
  getSyncTrends,
  getUnprocessedRecords,
  getInventorySourceBreakdown,
  getSyncErrorAnalysis
};
