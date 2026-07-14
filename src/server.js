require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const connectDB = require('./config/database');
const initModels = require('./config/initModels');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { activityLogger } = require('./middleware/activityLogger');


const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

(async () => {
  await connectDB();
  try {
    await initModels();
  } catch (error) {
    console.error('Warning: Failed to initialize models:', error.message);
  }
})();

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = corsOrigins.length > 0
  ? {
      origin(origin, callback) {
        if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }
  : { credentials: true };

app.use(cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

const JSON_LIMIT = process.env.JSON_BODY_LIMIT || '1mb';
const URLENCODED_LIMIT = process.env.URLENCODED_BODY_LIMIT || '100kb';
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: URLENCODED_LIMIT }));
app.use(mongoSanitize());

app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '7d',
  immutable: true,
  fallthrough: true,
}));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { skip: (req) => req.path === '/health' || req.path === '/api/health' }));
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 1000 : 5,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts. Please try again after 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 600),
  message: {
    success: false,
    error: {
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});
// Rate limiting is DISABLED by default (clients behind a shared office IP/NAT
// were tripping the per-IP limits). To re-enable, set ENABLE_RATE_LIMIT=true.
const rateLimitEnabled = process.env.ENABLE_RATE_LIMIT === 'true';
if (rateLimitEnabled) {
  app.use('/api', generalLimiter);
}

app.use(activityLogger({
  excludePaths: ['/health', '/api/health'],
  excludeMethods: [],
  logSuccessOnly: false,
}));

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const reportRoutes = require('./routes/reportRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const couponRoutes = require('./routes/couponRoutes');
const paymentTypeRoutes = require('./routes/paymentTypeRoutes');
const trashRoutes = require('./routes/trashRoutes');
const activityRoutes = require('./routes/activityRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const syncRoutes = require('./routes/syncRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const schedulerRoutes = require('./routes/schedulerRoutes');
const inventorySchedulerRoutes = require('./routes/inventoryScheduler.routes');
const quickBooksSyncRoutes = require('./routes/quickBooksSync.routes');
const qbwcRoutes = require('./routes/qbwc.routes');
const customerconnectRoutes = require('./routes/customerconnect.routes');
const routestarRoutes = require('./routes/routestar.routes');
const routeStarCustomerRoutes = require('./routes/routeStarCustomer.routes');
const stockReconciliationRoutes = require('./routes/stock-reconciliation.routes');
const modelCategoryRoutes = require('./routes/modelCategory.routes');
const routeStarItemsRoutes = require('./routes/routeStarItems.routes');
const routeStarItemAliasRoutes = require('./routes/routestarItemAlias.routes');
const stockRoutes = require('./routes/stock.routes');
const fetchHistoryRoutes = require('./routes/fetchHistory');
const employeeDataRoutes = require('./routes/employeeData.routes');
const truckCheckoutRoutes = require('./routes/truckCheckout.routes');
const discrepancyRoutes = require('./routes/discrepancy');
const orderDiscrepancyRoutes = require('./routes/orderDiscrepancy.routes');
const manualPurchaseOrderItemRoutes = require('./routes/manualPurchaseOrderItem.routes');
const vendorRoutes = require('./routes/vendor.routes');
const manualOrderRoutes = require('./routes/manualOrder.routes');
const goAuditsRoutes = require('./routes/goAudits.routes');
const screenPermissionRoutes = require('./routes/screenPermission.routes');
const activityLogRoutes = require('./routes/activityLogRoutes');

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', ...(rateLimitEnabled ? [loginLimiter] : []), authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/payment-types', paymentTypeRoutes);
app.use('/api/trash', trashRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api', purchaseRoutes);
app.use('/api', approvalRoutes);
app.use('/api', syncRoutes);
app.use('/api', warehouseRoutes);
app.use('/api', schedulerRoutes);
app.use('/api/inventory-scheduler', inventorySchedulerRoutes);
app.use('/api/qb-sync', quickBooksSyncRoutes);
app.use('/qbwc', qbwcRoutes);
app.use('/api/customerconnect', customerconnectRoutes);
app.use('/api/routestar', routestarRoutes);
app.use('/api/routestar-customers', routeStarCustomerRoutes);
app.use('/api/stock-reconciliation', stockReconciliationRoutes);
app.use('/api/model-category', modelCategoryRoutes);
app.use('/api/routestar-items', routeStarItemsRoutes);
app.use('/api/routestar-item-alias', routeStarItemAliasRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/fetch-history', fetchHistoryRoutes);
app.use('/api/employee-data', employeeDataRoutes);
app.use('/api/truck-checkouts', truckCheckoutRoutes);
app.use('/api/discrepancies', discrepancyRoutes);
app.use('/api/order-discrepancies', orderDiscrepancyRoutes);
app.use('/api/manual-po-items', manualPurchaseOrderItemRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/manual-orders', manualOrderRoutes);
app.use('/api/goaudits', goAuditsRoutes);
app.use('/api/screen-permissions', screenPermissionRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on http://${HOST}:${PORT}`);
  console.log(`Access locally at: http://127.0.0.1:${PORT}`);
  if (process.env.AUTO_START_SCHEDULER === 'true') {
    const { getInventoryScheduler } = require('./services/inventoryScheduler.service');
    const scheduler = getInventoryScheduler();
    try {
      const ordersLimit = !process.env.ORDERS_SYNC_LIMIT || process.env.ORDERS_SYNC_LIMIT === '0'
        ? Infinity
        : parseInt(process.env.ORDERS_SYNC_LIMIT);
      const invoicesLimit = !process.env.INVOICES_SYNC_LIMIT || process.env.INVOICES_SYNC_LIMIT === '0'
        ? Infinity
        : parseInt(process.env.INVOICES_SYNC_LIMIT);
      scheduler.start({
        cronExpression: process.env.SYNC_CRON_EXPRESSION || '0 3 * * *',
        ordersLimit,
        invoicesLimit,
        processStock: true,
        timezone: process.env.TZ || 'America/New_York',
      });
      console.log('✅ Inventory scheduler started');
    } catch (error) {
      console.error('Failed to start inventory scheduler:', error.message);
    }

    try {
      const { getScheduler } = require('./services/scheduler');
      const syncScheduler = getScheduler();
      syncScheduler.start({
        intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 30,
        limit: 50,
        processStock: true,
        systemUserId: null,
      });
      console.log('✅ Sync scheduler started');
    } catch (error) {
      console.error('Failed to start sync scheduler:', error.message);
    }
  }
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('Unhandled Rejection (continuing):', err.message);
  if (err.stack) console.error(err.stack);
});

process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  console.error('Stack trace:', err.stack);
  try {
    const { getInventoryScheduler } = require('./services/inventoryScheduler.service');
    getInventoryScheduler().stop();
  } catch (e) {
    console.error('Failed to stop scheduler during shutdown:', e.message);
  }
  const forceExit = setTimeout(() => process.exit(1), 5000).unref();
  server.close(() => {
    clearTimeout(forceExit);
    process.exit(1);
  });
});

const gracefulShutdown = (signal) => {
  console.log(`${signal} signal received: closing HTTP server`);
  try {
    const { getInventoryScheduler } = require('./services/inventoryScheduler.service');
    getInventoryScheduler().stop();
  } catch (e) {
    console.error('Scheduler stop failed:', e.message);
  }
  try {
    const auditQueue = require('./services/auditQueue');
    auditQueue.shutdown().catch((e) => console.error('auditQueue shutdown failed:', e.message));
  } catch (e) {}
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
