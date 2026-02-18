require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/database');
const initModels = require('./config/initModels');
const { errorHandler, notFound } = require('./middleware/errorHandler');


const app = express();



(async () => {
  await connectDB();

  
  try {
    await initModels();
  } catch (error) {
    console.error('Warning: Failed to initialize models:', error.message);
    
  }
})();


app.use(cors());


app.use(helmet());


app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}


const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: process.env.NODE_ENV === 'development' ? 1000 : 5, 
  message: {
    success: false,
    error: {
      message: 'Too many login attempts. Please try again after 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development', 
});


const generalLimiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : (process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  message: {
    success: false,
    error: {
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  },
  skip: (req) => process.env.NODE_ENV === 'development', 
});


if (process.env.NODE_ENV !== 'development') {
  app.use(generalLimiter);
}


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
const customerconnectRoutes = require('./routes/customerconnect.routes');
const routestarRoutes = require('./routes/routestar.routes');
const stockReconciliationRoutes = require('./routes/stock-reconciliation.routes');
const modelCategoryRoutes = require('./routes/modelCategory.routes');
const routeStarItemsRoutes = require('./routes/routeStarItems.routes');
const routeStarItemAliasRoutes = require('./routes/routestarItemAlias.routes');
const stockRoutes = require('./routes/stock.routes');
const fetchHistoryRoutes = require('./routes/fetchHistory');


app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});


app.use('/api/auth', loginLimiter, authRoutes);
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
app.use('/api/customerconnect', customerconnectRoutes);
app.use('/api/routestar', routestarRoutes);
app.use('/api/stock-reconciliation', stockReconciliationRoutes);
app.use('/api/model-category', modelCategoryRoutes);
app.use('/api/routestar-items', routeStarItemsRoutes);
app.use('/api/routestar-item-alias', routeStarItemAliasRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/fetch-history', fetchHistoryRoutes);


app.use(notFound);


app.use(errorHandler);


const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);

  
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
        timezone: process.env.TZ || 'America/New_York'
      });
      console.log('✅ Inventory scheduler started - Daily sync at 3:00 AM (fetching ALL data)');
    } catch (error) {
      console.error('Failed to start inventory scheduler:', error.message);
    }
  }
});


process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  const { getInventoryScheduler } = require('./services/inventoryScheduler.service');
  getInventoryScheduler().stop();
  server.close(() => process.exit(1));
});


process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  const { getInventoryScheduler } = require('./services/inventoryScheduler.service');
  getInventoryScheduler().stop();
  server.close(() => process.exit(1));
});


process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  const { getInventoryScheduler } = require('./services/inventoryScheduler.service');
  getInventoryScheduler().stop();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  const{ getInventoryScheduler } = require('./services/inventoryScheduler.service');
  getInventoryScheduler().stop();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;

