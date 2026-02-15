const winston = require('winston');
const path = require('path');
const fs = require('fs');


const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};


const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

winston.addColors(colors);


const logsDir = path.join(__dirname, '../../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}


const automationFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);


const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);


const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    
    new winston.transports.Console({
      format: consoleFormat
    }),

    
    new winston.transports.File({
      filename: path.join(logsDir, 'automation.log'),
      format: automationFormat,
      maxsize: 5242880, 
      maxFiles: 5
    }),

    
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: automationFormat,
      maxsize: 5242880, 
      maxFiles: 5
    })
  ]
});


logger.automation = (name) => {
  return logger.child({ automation: name });
};

module.exports = logger;
