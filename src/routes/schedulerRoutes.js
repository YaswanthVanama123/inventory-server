const express = require('express');
const router = express.Router();
const {
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  runNow
} = require('../controllers/schedulerController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.get('/scheduler/status', authenticate, requireAdmin(), getSchedulerStatus);
router.post('/scheduler/start', authenticate, requireAdmin(), startScheduler);
router.post('/scheduler/stop', authenticate, requireAdmin(), stopScheduler);
router.post('/scheduler/run-now', authenticate, requireAdmin(), runNow);

module.exports = router;
