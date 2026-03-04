const FetchHistory = require('../models/FetchHistory');


const getFetchHistory = async (req, res) => {
  try {
    const {
      source,
      status,
      fetchType,
      limit = 50,
      page = 1,
      days
    } = req.query;

    
    const query = {};

    
    if (days && days !== 'all') {
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - parseInt(days));
      query.startedAt = { $gte: dateFilter };
    }

    if (source) {
      query.source = source;
    }

    if (status) {
      query.status = status;
    }

    if (fetchType) {
      query.fetchType = fetchType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [history, total] = await Promise.all([
      FetchHistory.find(query)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      FetchHistory.countDocuments(query)
    ]);

    
    const enrichedHistory = history.map(item => {
      if (item.status === 'in_progress' && !item.duration) {
        item.calculatedDuration = Date.now() - new Date(item.startedAt).getTime();
      }
      return item;
    });

    res.json({
      success: true,
      history: enrichedHistory,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch history',
      error: error.message
    });
  }
};


const getActiveFetches = async (req, res) => {
  try {
    const { source } = req.query;

    const query = { status: 'in_progress' };
    if (source) {
      query.source = source;
    }

    const activeFetches = await FetchHistory.find(query)
      .sort({ startedAt: -1 })
      .lean();

    
    const enrichedFetches = activeFetches.map(fetch => ({
      ...fetch,
      currentDuration: Date.now() - new Date(fetch.startedAt).getTime()
    }));

    res.json({
      success: true,
      activeFetches: enrichedFetches,
      count: enrichedFetches.length
    });
  } catch (error) {
    console.error('Error fetching active fetches:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active fetches',
      error: error.message
    });
  }
};


const getStatistics = async (req, res) => {
  try {
    const { source, days } = req.query;

    const stats = await FetchHistory.getStatistics(source, days ? parseInt(days) : null);

    
    const activeQuery = { status: 'in_progress' };
    if (source) activeQuery.source = source;
    const activeCount = await FetchHistory.countDocuments(activeQuery);

    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayQuery = { startedAt: { $gte: todayStart } };
    if (source) todayQuery.source = source;
    const todayCount = await FetchHistory.countDocuments(todayQuery);

    
    const totalQuery = {};
    if (source) totalQuery.source = source;
    const [completed, failed] = await Promise.all([
      FetchHistory.countDocuments({ ...totalQuery, status: 'completed' }),
      FetchHistory.countDocuments({ ...totalQuery, status: 'failed' })
    ]);

    const successRate = completed + failed > 0
      ? ((completed / (completed + failed)) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      statistics: stats,
      summary: {
        activeCount,
        todayCount,
        successRate: parseFloat(successRate),
        totalCompleted: completed,
        totalFailed: failed
      }
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};


const getFetchDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const fetch = await FetchHistory.findById(id).lean();

    if (!fetch) {
      return res.status(404).json({
        success: false,
        message: 'Fetch history not found'
      });
    }

    
    if (fetch.status === 'in_progress') {
      fetch.currentDuration = Date.now() - new Date(fetch.startedAt).getTime();
    }

    res.json({
      success: true,
      fetch
    });
  } catch (error) {
    console.error('Error fetching details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch details',
      error: error.message
    });
  }
};


const cancelFetch = async (req, res) => {
  try {
    const { id } = req.params;

    const fetch = await FetchHistory.findById(id);

    if (!fetch) {
      return res.status(404).json({
        success: false,
        message: 'Fetch history not found'
      });
    }

    if (fetch.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Can only cancel in-progress fetches'
      });
    }

    fetch.status = 'cancelled';
    fetch.completedAt = new Date();
    fetch.duration = fetch.completedAt - fetch.startedAt;
    await fetch.save();

    res.json({
      success: true,
      message: 'Fetch cancelled successfully',
      fetch
    });
  } catch (error) {
    console.error('Error cancelling fetch:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel fetch',
      error: error.message
    });
  }
};


const cleanupOldRecords = async (req, res) => {
  try {
    const { days = 10 } = req.query;

    const dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - parseInt(days));

    const result = await FetchHistory.deleteMany({
      startedAt: { $lt: dateFilter }
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old records`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error cleaning up records:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup records',
      error: error.message
    });
  }
};


const getPageData = async (req, res) => {
  try {
    const {
      source,
      status,
      fetchType,
      limit = 50,
      page = 1,
      days,
      startDate,
      endDate
    } = req.query;

    console.log('=== FETCH HISTORY PAGE DATA DEBUG ===');
    console.log('Query params:', { source, status, fetchType, limit, page, days, startDate, endDate });

    
    const query = {};

    
    if (startDate && endDate) {
      
      query.startedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (days && days !== '0' && days !== 'all') {
      
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - parseInt(days));
      query.startedAt = { $gte: dateFilter };
    }
    

    console.log('Built query:', JSON.stringify(query, null, 2));

    if (source) query.source = source;
    if (status) query.status = status;
    if (fetchType) query.fetchType = fetchType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log('Final query before DB call:', JSON.stringify(query, null, 2));
    console.log('Skip:', skip, 'Limit:', limit);

    
    const totalInCollection = await FetchHistory.countDocuments({});
    console.log('Total documents in FetchHistory collection:', totalInCollection);

    
    const activeQuery = { status: 'in_progress' };
    if (source) activeQuery.source = source;

    
    const [history, total, activeFetches, statsData] = await Promise.all([
      
      FetchHistory.find(query)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      
      FetchHistory.countDocuments(query),

      
      FetchHistory.find(activeQuery)
        .sort({ startedAt: -1 })
        .lean(),

      
      (async () => {
        
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayQuery = { startedAt: { $gte: todayStart } };
        if (source) todayQuery.source = source;

        
        const totalQuery = {};
        if (source) totalQuery.source = source;

        
        if (startDate && endDate) {
          totalQuery.startedAt = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          };
        } else if (days && days !== '0' && days !== 'all') {
          const dateFilter = new Date();
          dateFilter.setDate(dateFilter.getDate() - parseInt(days));
          totalQuery.startedAt = { $gte: dateFilter };
        }

        const [activeCount, todayCount, completed, failed] = await Promise.all([
          FetchHistory.countDocuments(activeQuery),
          FetchHistory.countDocuments(todayQuery),
          FetchHistory.countDocuments({ ...totalQuery, status: 'completed' }),
          FetchHistory.countDocuments({ ...totalQuery, status: 'failed' })
        ]);

        const successRate = completed + failed > 0
          ? ((completed / (completed + failed)) * 100).toFixed(2)
          : 0;

        return {
          activeCount,
          todayCount,
          successRate: parseFloat(successRate),
          totalCompleted: completed,
          totalFailed: failed
        };
      })()
    ]);

    console.log('Query results:');
    console.log('- History records found:', history.length);
    console.log('- Total count:', total);
    console.log('- Active fetches:', activeFetches.length);
    console.log('- Stats:', JSON.stringify(statsData, null, 2));

    
    const enrichedHistory = history.map(item => {
      if (item.status === 'in_progress' && !item.duration) {
        item.calculatedDuration = Date.now() - new Date(item.startedAt).getTime();
      }
      return item;
    });

    
    const enrichedActiveFetches = activeFetches.map(fetch => ({
      ...fetch,
      currentDuration: Date.now() - new Date(fetch.startedAt).getTime()
    }));

    res.json({
      success: true,
      data: {
        history: enrichedHistory,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        },
        activeFetches: enrichedActiveFetches,
        summary: statsData
      }
    });
  } catch (error) {
    console.error('Error fetching page data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch page data',
      error: error.message
    });
  }
};

module.exports = {
  getFetchHistory,
  getActiveFetches,
  getStatistics,
  getFetchDetails,
  cancelFetch,
  cleanupOldRecords,
  getPageData
};
