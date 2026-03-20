const express = require('express');
const router = express.Router();
const routeStarCustomerController = require('../controllers/routeStarCustomerController');
const { authenticate } = require('../middleware/auth');

router.get('/stats', authenticate, routeStarCustomerController.getCustomerStats);
router.get('/', authenticate, routeStarCustomerController.getCustomers);
router.get('/:id', authenticate, routeStarCustomerController.getCustomerById);
router.post('/sync', authenticate, routeStarCustomerController.syncCustomers);
router.post('/sync-details', authenticate, routeStarCustomerController.syncCustomerDetails);
router.delete('/all', authenticate, routeStarCustomerController.deleteAllCustomers);

module.exports = router;
