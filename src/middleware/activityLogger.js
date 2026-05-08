const AuditLog = require('../models/AuditLog');

// Try to load ua-parser-js, but make it optional
let UAParser;
try {
  UAParser = require('ua-parser-js');
} catch (err) {
  console.warn('ua-parser-js not installed. Install with: npm install ua-parser-js');
  console.warn('Activity logging will work but with limited user agent parsing');
}

/**
 * Activity Logger Middleware
 * Logs user activities and API requests to the database
 */

// Helper to determine device type from user agent
const getDeviceType = (userAgent) => {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'mobile';
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'tablet';
  }
  if (ua.includes('electron') || ua.includes('desktop')) {
    return 'desktop';
  }
  return 'web';
};

// Helper to parse user agent
const parseUserAgent = (userAgentString) => {
  if (!userAgentString) {
    return { browser: 'Unknown', os: 'Unknown' };
  }

  // If UAParser is not available, do basic parsing
  if (!UAParser) {
    const ua = userAgentString.toLowerCase();
    let browser = 'Unknown';
    let os = 'Unknown';

    // Basic browser detection
    if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari')) browser = 'Safari';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('edge')) browser = 'Edge';

    // Basic OS detection
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

    return { browser, os };
  }

  // Use UAParser if available
  const parser = new UAParser(userAgentString);
  const result = parser.getResult();

  return {
    browser: result.browser.name || 'Unknown',
    os: result.os.name || 'Unknown'
  };
};

// Helper to get IP address
const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
};

/**
 * Main activity logging middleware
 * Captures request start time and sets up response logging
 */
const activityLogger = (options = {}) => {
  const {
    excludePaths = ['/health', '/api/health'],
    excludeMethods = [],
    logSuccessOnly = false
  } = options;

  return async (req, res, next) => {
    // Skip logging for excluded paths
    if (excludePaths.some(path => req.path.includes(path))) {
      return next();
    }

    // Skip logging for excluded methods
    if (excludeMethods.includes(req.method)) {
      return next();
    }

    // Capture start time
    const startTime = Date.now();

    // Store original res.json and res.send
    const originalJson = res.json;
    const originalSend = res.send;

    // Track if response has been logged
    let logged = false;

    // Create log function
    const logActivity = async (success = true, errorMessage = null) => {
      if (logged) return;
      logged = true;

      // Skip logging if not authenticated and no special case
      if (!req.user && !req.path.includes('/login') && !req.path.includes('/register')) {
        return;
      }

      try {
        const duration = Date.now() - startTime;
        const userAgent = req.headers['user-agent'] || '';
        const { browser, os } = parseUserAgent(userAgent);

        const logData = {
          method: req.method,
          endpoint: req.originalUrl || req.url,
          statusCode: res.statusCode,
          duration,
          ipAddress: getClientIp(req),
          userAgent,
          device: getDeviceType(userAgent),
          browser,
          os,
          success,
          errorMessage,
          timestamp: new Date()
        };

        // Add user information if authenticated
        if (req.user) {
          logData.performedBy = req.user._id || req.user.id;
          logData.performedByName = req.user.fullName || req.user.username || 'Unknown';
          logData.performedByEmail = req.user.email;
          logData.performedByRole = req.user.role;
        }

        // Add action and resource from metadata if available
        if (req.activityMeta) {
          Object.assign(logData, req.activityMeta);
        }

        // Skip logging if action or resource is missing (required fields)
        if (!logData.action || !logData.resource) {
          return;
        }

        // Don't block response for logging
        setImmediate(() => {
          AuditLog.logActivity(logData).catch(err => {
            console.error('Activity logging failed:', err.message);
          });
        });
      } catch (error) {
        console.error('Activity logger error:', error);
      }
    };

    // Override res.json
    res.json = function(data) {
      const success = res.statusCode >= 200 && res.statusCode < 400;
      if (!logSuccessOnly || success) {
        logActivity(success);
      }
      return originalJson.call(this, data);
    };

    // Override res.send
    res.send = function(data) {
      const success = res.statusCode >= 200 && res.statusCode < 400;
      if (!logSuccessOnly || success) {
        logActivity(success);
      }
      return originalSend.call(this, data);
    };

    // Handle errors
    res.on('finish', () => {
      if (!logged) {
        const success = res.statusCode >= 200 && res.statusCode < 400;
        logActivity(success);
      }
    });

    next();
  };
};

/**
 * Helper middleware to add activity metadata to request
 * Use this before route handlers to specify what action/resource is being logged
 */
const setActivityMeta = (action, resource, options = {}) => {
  return (req, res, next) => {
    req.activityMeta = {
      action,
      resource,
      ...options
    };
    next();
  };
};

/**
 * Manual activity logging function
 * Use this to log specific activities that aren't API requests
 */
const logActivity = async (activityData, user = null, req = null) => {
  try {
    const logData = { ...activityData };

    // Add user information
    if (user) {
      logData.performedBy = user._id || user.id;
      logData.performedByName = user.fullName || user.username;
      logData.performedByEmail = user.email;
      logData.performedByRole = user.role;
    }

    // Add request information if available
    if (req) {
      const userAgent = req.headers['user-agent'] || '';
      const { browser, os } = parseUserAgent(userAgent);

      logData.ipAddress = getClientIp(req);
      logData.userAgent = userAgent;
      logData.device = getDeviceType(userAgent);
      logData.browser = browser;
      logData.os = os;
    }

    return await AuditLog.logActivity(logData);
  } catch (error) {
    console.error('Manual activity logging failed:', error);
    return null;
  }
};

module.exports = {
  activityLogger,
  setActivityMeta,
  logActivity
};
