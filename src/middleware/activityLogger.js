const AuditLog = require('../models/AuditLog');
const auditQueue = require('../services/auditQueue');

let UAParser;
try {
  UAParser = require('ua-parser-js');
} catch (err) {
  console.warn('ua-parser-js not installed. Install with: npm install ua-parser-js');
}

const getDeviceType = (userAgent) => {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile';
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';
  if (ua.includes('electron') || ua.includes('desktop')) return 'desktop';
  return 'web';
};

const parseUserAgent = (userAgentString) => {
  if (!userAgentString) return { browser: 'Unknown', os: 'Unknown' };
  if (!UAParser) {
    const ua = userAgentString.toLowerCase();
    let browser = 'Unknown';
    let os = 'Unknown';
    if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari')) browser = 'Safari';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('edge')) browser = 'Edge';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
    return { browser, os };
  }
  const parser = new UAParser(userAgentString);
  const result = parser.getResult();
  return {
    browser: result.browser.name || 'Unknown',
    os: result.os.name || 'Unknown',
  };
};

const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0].trim() ||
  req.headers['x-real-ip'] ||
  req.connection?.remoteAddress ||
  req.socket?.remoteAddress ||
  req.ip ||
  'unknown';

const activityLogger = (options = {}) => {
  const excludePaths = new Set(options.excludePaths ?? ['/health', '/api/health']);
  const excludeMethods = new Set(options.excludeMethods ?? []);
  const logSuccessOnly = options.logSuccessOnly ?? false;

  return (req, res, next) => {
    if (excludePaths.has(req.path)) return next();
    if (excludeMethods.has(req.method)) return next();

    const startTime = process.hrtime.bigint();

    res.on('finish', () => {
      if (!req.user && !req.path.includes('/login') && !req.path.includes('/register')) return;
      const success = res.statusCode >= 200 && res.statusCode < 400;
      if (logSuccessOnly && !success) return;
      if (!req.activityMeta?.action || !req.activityMeta?.resource) return;

      const userAgent = req.headers['user-agent'] || '';
      const { browser, os } = parseUserAgent(userAgent);
      const duration = Number(process.hrtime.bigint() - startTime) / 1e6;

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
        timestamp: new Date(),
        ...req.activityMeta,
      };
      if (req.user) {
        logData.performedBy = req.user._id || req.user.id;
        logData.performedByName = req.user.fullName || req.user.username || 'Unknown';
        logData.performedByEmail = req.user.email;
        logData.performedByRole = req.user.role;
      }

      setImmediate(() => {
        auditQueue.enqueue(logData);
      });
    });

    next();
  };
};

const setActivityMeta = (action, resource, options = {}) => (req, res, next) => {
  req.activityMeta = { action, resource, ...options };
  next();
};

const logActivity = async (activityData, user = null, req = null) => {
  try {
    const logData = { ...activityData };
    if (user) {
      logData.performedBy = user._id || user.id;
      logData.performedByName = user.fullName || user.username;
      logData.performedByEmail = user.email;
      logData.performedByRole = user.role;
    }
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

module.exports = { activityLogger, setActivityMeta, logActivity };
