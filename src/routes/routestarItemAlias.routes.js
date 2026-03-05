const express = require('express');
const router = express.Router();
const routeStarItemAliasController = require('../controllers/routeStarItemAliasController');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.get('/page-data', authenticate, routeStarItemAliasController.getPageData);
router.get('/mappings', authenticate, routeStarItemAliasController.getAllMappings);
router.get('/unique-items', authenticate, routeStarItemAliasController.getUniqueItems);
router.post('/mapping', authenticate, requireAdmin(), routeStarItemAliasController.createMapping);
router.put('/mapping/:id', authenticate, requireAdmin(), routeStarItemAliasController.updateMapping);
router.post('/mapping/:id/add-alias', authenticate, requireAdmin(), routeStarItemAliasController.addAlias);
router.delete('/mapping/:id/alias/:aliasName', authenticate, requireAdmin(), routeStarItemAliasController.removeAlias);
router.delete('/mapping/:id', authenticate, requireAdmin(), routeStarItemAliasController.deleteMapping);
router.get('/lookup-map', authenticate, routeStarItemAliasController.getLookupMap);
router.get('/suggested-mappings', authenticate, routeStarItemAliasController.getSuggestedMappings);
router.get('/stats', authenticate, routeStarItemAliasController.getStats);
module.exports = router;
