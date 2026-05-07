const AuditLog = require('../models/AuditLog');

/**
 * Activity Log Service
 * Handles business logic for activity logs
 */

class ActivityLogService {
  /**
   * Get activity logs with filtering and pagination
   */
  async getActivityLogs(filters = {}) {
    return await AuditLog.getActivityLogs(filters);
  }

  /**
   * Get activity statistics
   */
  async getActivityStats(filters = {}) {
    return await AuditLog.getActivityStats(filters);
  }

  /**
   * Get user's own activity logs
   */
  async getUserActivityLogs(userId, filters = {}) {
    const userFilters = {
      ...filters,
      performedBy: userId
    };
    return await AuditLog.getActivityLogs(userFilters);
  }

  /**
   * Get recent activities
   */
  async getRecentActivities(limit = 20) {
    try {
      const logs = await AuditLog.find()
        .populate('performedBy', 'username fullName email role')
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return logs;
    } catch (error) {
      console.error('Get recent activities error:', error);
      throw error;
    }
  }

  /**
   * Get activity timeline for a resource
   */
  async getResourceTimeline(resource, resourceId) {
    try {
      const logs = await AuditLog.find({ resource, resourceId })
        .populate('performedBy', 'username fullName email role')
        .sort({ timestamp: -1 })
        .lean();

      return logs;
    } catch (error) {
      console.error('Get resource timeline error:', error);
      throw error;
    }
  }

  /**
   * Get activity breakdown by time period
   */
  async getActivityBreakdown(filters = {}) {
    const { startDate, endDate, groupBy = 'day' } = filters;

    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    let dateGrouping;
    switch (groupBy) {
      case 'hour':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' }
        };
        break;
      case 'day':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
        break;
      case 'week':
        dateGrouping = {
          year: { $year: '$timestamp' },
          week: { $week: '$timestamp' }
        };
        break;
      case 'month':
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' }
        };
        break;
      default:
        dateGrouping = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
    }

    try {
      const breakdown = await AuditLog.aggregate([
        { $match: query },
        {
          $group: {
            _id: dateGrouping,
            total: { $sum: 1 },
            successful: {
              $sum: { $cond: [{ $eq: ['$success', true] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$success', false] }, 1, 0] }
            }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } },
        { $limit: 30 }
      ]);

      return breakdown;
    } catch (error) {
      console.error('Get activity breakdown error:', error);
      throw error;
    }
  }

  /**
   * Get top active users
   */
  async getTopActiveUsers(limit = 10, filters = {}) {
    const { startDate, endDate } = filters;
    const query = {};

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    try {
      const topUsers = await AuditLog.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$performedBy',
            activityCount: { $sum: 1 },
            name: { $first: '$performedByName' },
            email: { $first: '$performedByEmail' },
            role: { $first: '$performedByRole' },
            lastActivity: { $max: '$timestamp' }
          }
        },
        { $sort: { activityCount: -1 } },
        { $limit: limit }
      ]);

      return topUsers;
    } catch (error) {
      console.error('Get top active users error:', error);
      throw error;
    }
  }

  /**
   * Get failed activities
   */
  async getFailedActivities(filters = {}) {
    const { page = 1, limit = 50 } = filters;

    try {
      const failedFilters = {
        ...filters,
        success: false,
        page,
        limit
      };

      return await AuditLog.getActivityLogs(failedFilters);
    } catch (error) {
      console.error('Get failed activities error:', error);
      throw error;
    }
  }

  /**
   * Export activity logs
   */
  async exportActivityLogs(filters = {}, format = 'json') {
    try {
      const { logs } = await this.getActivityLogs({ ...filters, limit: 10000 });

      if (format === 'csv') {
        return this._convertToCSV(logs);
      }

      return logs;
    } catch (error) {
      console.error('Export activity logs error:', error);
      throw error;
    }
  }

  /**
   * Convert logs to CSV format
   */
  _convertToCSV(logs) {
    if (!logs || logs.length === 0) {
      return '';
    }

    const headers = [
      'Timestamp',
      'User',
      'Email',
      'Role',
      'Action',
      'Resource',
      'Resource Name',
      'Method',
      'Endpoint',
      'Status Code',
      'Duration (ms)',
      'Device',
      'Browser',
      'IP Address',
      'Success'
    ];

    const rows = logs.map(log => [
      log.timestamp,
      log.performedByName || '',
      log.performedByEmail || '',
      log.performedByRole || '',
      log.action || '',
      log.resource || '',
      log.resourceName || '',
      log.method || '',
      log.endpoint || '',
      log.statusCode || '',
      log.duration || 0,
      log.device || '',
      log.browser || '',
      log.ipAddress || '',
      log.success ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Delete old activity logs (cleanup)
   */
  async deleteOldLogs(daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await AuditLog.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      return {
        success: true,
        deletedCount: result.deletedCount,
        message: `Deleted ${result.deletedCount} logs older than ${daysToKeep} days`
      };
    } catch (error) {
      console.error('Delete old logs error:', error);
      throw error;
    }
  }
}

module.exports = new ActivityLogService();
