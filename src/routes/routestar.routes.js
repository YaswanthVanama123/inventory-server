const express = require('express');
const router = express.Router();
const routeStarController = require('../controllers/routeStarController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * RouteStar Routes
 * Clean routes with no business logic - delegates to controller
 */

// Sync items from RouteStar
router.post('/sync/items', authenticate, requireAdmin(), routeStarController.syncItems);

// Sync pending invoices
router.post('/sync/pending', authenticate, requireAdmin(), routeStarController.syncPending);

// Get invoice range (highest/lowest invoice numbers)
router.get('/invoice-range', authenticate, requireAdmin(), routeStarController.getInvoiceRange);

// Sync closed invoices
router.post('/sync/closed', authenticate, requireAdmin(), routeStarController.syncClosed);

// Sync single invoice details
router.post('/sync/details/:invoiceNumber', authenticate, requireAdmin(), routeStarController.syncInvoiceDetails);

// Sync all invoice details
router.post('/sync/all-details', authenticate, requireAdmin(), routeStarController.syncAllDetails);

// Sync pending invoice details
router.post('/sync/pending-details', authenticate, requireAdmin(), routeStarController.syncPendingDetails);

// Sync closed invoice details
router.post('/sync/closed-details', authenticate, requireAdmin(), routeStarController.syncClosedDetails);

// Sync pending invoices with details (combined operation)
router.post('/sync/pending-with-details', authenticate, requireAdmin(), routeStarController.syncPendingWithDetails);

// Sync closed invoices with details (combined operation)
router.post('/sync/closed-with-details', authenticate, requireAdmin(), routeStarController.syncClosedWithDetails);

// Check pending invoices in RouteStar
router.get('/check-pending', authenticate, requireAdmin(), routeStarController.checkPending);

// Process stock movements
router.post('/sync/stock', authenticate, requireAdmin(), routeStarController.syncStock);

// Full sync (items + invoices + stock)
router.post('/sync/full', authenticate, requireAdmin(), routeStarController.fullSync);

// Get invoices with pagination and filtering
router.get('/invoices', authenticate, requireAdmin(), routeStarController.getInvoices);

// Get single invoice by number
router.get('/invoices/:invoiceNumber', authenticate, requireAdmin(), routeStarController.getInvoiceByNumber);

// Get sales statistics
router.get('/stats', authenticate, requireAdmin(), routeStarController.getStats);

// Delete all pending invoices
router.delete('/invoices/pending/all', authenticate, requireAdmin(), routeStarController.deleteAllPending);

// Delete all closed invoices
router.delete('/invoices/closed/all', authenticate, requireAdmin(), routeStarController.deleteAllClosed);

// Get grouped items (sold items with quantities)
router.get('/items/grouped', authenticate, routeStarController.getGroupedItems);

// Get invoices for specific item
router.get('/items/:itemName/invoices', authenticate, routeStarController.getInvoicesByItem);

// Bulk delete invoices by items
router.post('/invoices/bulk-delete', authenticate, requireAdmin(), routeStarController.bulkDeleteInvoices);

// Bulk delete invoices by invoice numbers
router.post('/invoices/bulk-delete-by-numbers', authenticate, requireAdmin(), routeStarController.bulkDeleteByNumbers);

// Get all items with pagination
router.get('/items', authenticate, requireAdmin(), routeStarController.getItems);

// Get low stock items
router.get('/items/low-stock', authenticate, requireAdmin(), routeStarController.getLowStockItems);

// Delete all items
router.delete('/items/all', authenticate, requireAdmin(), routeStarController.deleteAllItems);

// Get item invoice usage stats
router.get('/items/invoice-usage', authenticate, routeStarController.getItemInvoiceUsage);

module.exports = router;
