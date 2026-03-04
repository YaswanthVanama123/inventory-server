const express = require('express');
const router = express.Router();
const modelCategoryController = require('../controllers/modelCategoryController');
const { authenticate } = require('../middleware/auth');




router.get('/unique-models', authenticate, modelCategoryController.getUniqueModels);


router.get('/routestar-items', authenticate, modelCategoryController.getRouteStarItems);


router.post('/mapping', authenticate, modelCategoryController.saveMapping);


router.delete('/mapping/:modelNumber', authenticate, modelCategoryController.deleteMapping);


router.get('/mappings', authenticate, modelCategoryController.getAllMappings);

module.exports = router;
