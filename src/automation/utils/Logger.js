const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

winston.addColors(colors);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for automation logs
const automationFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format (pretty print)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // Console output
    new winston.transports.Console({
      format: consoleFormat
    }),

    // File output - All logs
    new winston.transports.File({
      filename: path.join(logsDir, 'automation.log'),
      format: automationFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // File output - Error logs only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: automationFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Create child logger for specific automation
logger.automation = (name) => {
  return logger.child({ automation: name });
};

module.exports = logger;
