const express = require('express');
const router = express.Router();
const routeStarItemsController = require('../controllers/routeStarItemsController');
const { authenticate } = require('../middleware/auth');


router.get('/page-data', authenticate, routeStarItemsController.getItemsWithStats);
router.get('/stats', authenticate, routeStarItemsController.getItemStats);
router.get('/', authenticate, routeStarItemsController.getItems);
router.patch('/:id/flags', authenticate, routeStarItemsController.updateItemFlags);
router.delete('/all', authenticate, routeStarItemsController.deleteAllItems);
router.post('/sync', authenticate, routeStarItemsController.syncItems);
router.get('/sales-report', authenticate, routeStarItemsController.getSalesReport);
module.exports = router;
