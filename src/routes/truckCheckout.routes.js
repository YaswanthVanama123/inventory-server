const express = require('express');
const router = express.Router();
const truckCheckoutController = require('../controllers/truckCheckoutController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * Truck Checkout Routes
 * Clean routes with no business logic - delegates to controller
 */

// Search items for dropdown
router.get('/items/search', authenticate, truckCheckoutController.searchItems);

// Get current stock for an item
router.get('/stock/:itemName', authenticate, truckCheckoutController.getItemStock);

// Get active checkouts
router.get('/active', authenticate, truckCheckoutController.getActiveCheckouts);

// Get checkouts by employee
router.get('/employee/:employeeName', authenticate, truckCheckoutController.getCheckoutsByEmployee);

// Get employee stats
router.get('/stats/employee/:employeeName', authenticate, truckCheckoutController.getEmployeeStats);

// Get checkout sales tracking (matches checkouts with invoices)
router.get('/sales-tracking', authenticate, truckCheckoutController.getCheckoutSalesTracking);

// Create new checkout (NEW - recommended)
router.post('/create-new', authenticate, truckCheckoutController.createCheckout);

// Get all checkouts with filtering
router.get('/', authenticate, truckCheckoutController.getCheckouts);

// Get checkout by ID
router.get('/:id', authenticate, truckCheckoutController.getCheckoutById);

// Delete checkout
router.delete('/:id', authenticate, requireAdmin(), truckCheckoutController.deleteCheckout);

// ===== OLD ENDPOINTS (Kept for backwards compatibility) =====
// These should be migrated to use the new structure

const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarSyncService = require('../services/routeStarSync.service');
const TruckCheckout = require('../models/TruckCheckout');
const StockMovement = require('../models/StockMovement');

// OLD: Create checkout with multiple items (DEPRECATED)
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      employeeName,
      employeeId,
      truckNumber,
      itemsTaken,
      notes,
      checkoutDate
    } = req.body;

    if (!employeeName || !itemsTaken || itemsTaken.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Employee name and items are required'
      });
    }

    const checkout = await TruckCheckout.create({
      employeeName,
      employeeId,
      truckNumber,
      itemsTaken,
      notes,
      checkoutDate: checkoutDate || new Date(),
      createdBy: req.user?.username || 'system',
      status: 'checked_out'
    });

    // Create stock movements for checked out items
    const RouteStarItemAlias = require('../models/RouteStarItemAlias');
    const StockSummary = require('../models/StockSummary');

    console.log(`\n✓ Truck checkout created for ${employeeName}, ${itemsTaken.length} items`);
    console.log(`  Creating OUT stock movements for checked out items...`);

    for (const item of itemsTaken) {
      if (item.quantity <= 0) continue;

      try {
        const canonicalName = await RouteStarItemAlias.getCanonicalName(item.name);
        const sku = (item.sku || canonicalName || item.name).toUpperCase();

        await StockMovement.create({
          sku: sku,
          type: 'OUT',
          qty: item.quantity,
          refType: 'TRUCK_CHECKOUT',
          refId: checkout._id,
          sourceRef: `Checkout to ${employeeName} - Truck ${truckNumber || 'N/A'}`,
          timestamp: checkout.checkoutDate,
          notes: `Checked out to truck: ${employeeName}${item.notes ? ` (${item.notes})` : ''}`
        });

        let stockSummary = await StockSummary.findOne({ sku });
        if (!stockSummary) {
          stockSummary = await StockSummary.create({
            sku,
            availableQty: 0,
            reservedQty: 0,
            totalInQty: 0,
            totalOutQty: 0,
            lowStockThreshold: 10
          });
        }
        stockSummary.removeStock(item.quantity);
        await stockSummary.save();

        console.log(`  ✓ OUT movement created for ${sku}: -${item.quantity}`);
      } catch (error) {
        console.error(`  ✗ Failed to create stock movement for ${item.name}: ${error.message}`);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Checkout created successfully',
      data: checkout
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout',
      error: error.message
    });
  }
});

// Complete checkout with invoice numbers
router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { invoiceNumbers, invoiceType = 'closed' } = req.body;

    if (!invoiceNumbers || invoiceNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one invoice number is required'
      });
    }

    const checkout = await TruckCheckout.findById(id);

    if (!checkout) {
      return res.status(404).json({
        success: false,
        message: 'Checkout not found'
      });
    }

    if (checkout.status !== 'checked_out') {
      return res.status(400).json({
        success: false,
        message: `Checkout is already ${checkout.status}`
      });
    }

    // Validation: Check for duplicate invoices
    const duplicateCheckouts = await TruckCheckout.find({
      _id: { $ne: checkout._id },
      invoiceNumbers: { $in: invoiceNumbers },
      status: { $in: ['completed', 'checked_out'] }
    }).select('_id employeeName invoiceNumbers');

    if (duplicateCheckouts.length > 0) {
      const duplicateInvoices = [];
      for (const dup of duplicateCheckouts) {
        const sharedInvoices = dup.invoiceNumbers.filter(inv => invoiceNumbers.includes(inv));
        if (sharedInvoices.length > 0) {
          duplicateInvoices.push({
            checkoutId: dup._id,
            employeeName: dup.employeeName,
            invoices: sharedInvoices
          });
        }
      }

      return res.status(400).json({
        success: false,
        message: 'One or more invoices are already linked to another checkout (possible theft/fraud)',
        duplicateCheckouts: duplicateInvoices
      });
    }

    await checkout.markCompleted(
      invoiceNumbers,
      invoiceType,
      req.user?.username || 'system'
    );

    console.log(`✓ Checkout ${id} marked as completed with ${invoiceNumbers.length} invoices`);

    res.json({
      success: true,
      message: 'Checkout completed successfully',
      data: checkout
    });
  } catch (error) {
    console.error('Complete checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete checkout',
      error: error.message
    });
  }
});

// Check work endpoint (tally before completing)
router.post('/:id/check-work', authenticate, async (req, res) => {
  let syncService = null;

  try {
    const { id } = req.params;
    const { invoiceNumbers, invoiceType = 'closed' } = req.body;

    if (!invoiceNumbers || invoiceNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one invoice number is required'
      });
    }

    const checkout = await TruckCheckout.findById(id);

    if (!checkout) {
      return res.status(404).json({
        success: false,
        message: 'Checkout not found'
      });
    }

    if (checkout.status !== 'checked_out') {
      return res.status(400).json({
        success: false,
        message: 'Can only check work for checked out items'
      });
    }

    // Fetch and compare invoices
    console.log(`\n📊 Starting check work for checkout ${id}`);
    console.log(`   Fetching ${invoiceNumbers.length} ${invoiceType} invoices...`);

    const invoicesFromDB = await RouteStarInvoice.find({
      invoiceNumber: { $in: invoiceNumbers }
    }).lean();

    const fetchedInvoices = [];
    const missingInvoices = [];

    for (const invoiceNumber of invoiceNumbers) {
      const dbInvoice = invoicesFromDB.find(inv => inv.invoiceNumber === invoiceNumber);

      if (dbInvoice && dbInvoice.lineItems && dbInvoice.lineItems.length > 0) {
        fetchedInvoices.push({
          invoiceNumber: dbInvoice.invoiceNumber,
          customer: dbInvoice.customer?.name || 'Unknown',
          items: dbInvoice.lineItems.map(item => ({
            name: item.name,
            sku: item.sku || item.name,
            quantity: item.quantity
          })),
          total: dbInvoice.total,
          fetchedAt: new Date()
        });
      } else {
        missingInvoices.push(invoiceNumber);
      }
    }

    // Fetch missing invoices from RouteStar if needed
    if (missingInvoices.length > 0) {
      console.log(`   ${missingInvoices.length} invoices need to be fetched from RouteStar...`);

      syncService = new RouteStarSyncService();
      await syncService.init();

      for (const invoiceNumber of missingInvoices) {
        try {
          console.log(`   → Fetching ${invoiceNumber} from RouteStar...`);
          const invoice = await syncService.syncInvoiceDetails(invoiceNumber);

          if (invoice && invoice.lineItems && invoice.lineItems.length > 0) {
            fetchedInvoices.push({
              invoiceNumber: invoice.invoiceNumber,
              customer: invoice.customer?.name || 'Unknown',
              items: invoice.lineItems.map(item => ({
                name: item.name,
                sku: item.sku || item.name,
                quantity: item.quantity
              })),
              total: invoice.total,
              fetchedAt: new Date()
            });
            console.log(`   ✓ Fetched ${invoiceNumber}`);
          }
        } catch (error) {
          console.error(`   ✗ Failed to fetch ${invoiceNumber}: ${error.message}`);
        }
      }
    }

    // Tally items
    const RouteStarItemAlias = require('../models/RouteStarItemAlias');
    const aliasMap = await RouteStarItemAlias.buildLookupMap();

    const itemsSoldMap = {};
    for (const invoice of fetchedInvoices) {
      for (const item of invoice.items) {
        const canonicalName = aliasMap[item.name.toLowerCase()] || item.name;
        const key = canonicalName.toUpperCase();

        if (!itemsSoldMap[key]) {
          itemsSoldMap[key] = {
            name: canonicalName,
            sku: item.sku || canonicalName,
            quantitySold: 0
          };
        }
        itemsSoldMap[key].quantitySold += item.quantity;
      }
    }

    const itemsSold = Object.values(itemsSoldMap);

    const itemsTakenMap = {};
    for (const item of checkout.itemsTaken || []) {
      const canonicalName = aliasMap[item.name?.toLowerCase()] || item.name;
      const key = canonicalName.toUpperCase();

      if (!itemsTakenMap[key]) {
        itemsTakenMap[key] = {
          name: canonicalName,
          sku: item.sku || canonicalName,
          quantityTaken: 0
        };
      }
      itemsTakenMap[key].quantityTaken += item.quantity;
    }

    const itemsTaken = Object.values(itemsTakenMap);

    const discrepancies = [];
    for (const key of Object.keys(itemsTakenMap)) {
      const taken = itemsTakenMap[key];
      const sold = itemsSoldMap[key] || { name: taken.name, sku: taken.sku, quantitySold: 0 };

      const difference = taken.quantityTaken - sold.quantitySold;
      let status = 'matched';

      if (difference > 0) {
        status = 'excess';
      } else if (difference < 0) {
        status = 'shortage';
      }

      discrepancies.push({
        name: taken.name,
        sku: taken.sku,
        quantityTaken: taken.quantityTaken,
        quantitySold: sold.quantitySold,
        difference,
        status
      });
    }

    checkout.invoiceNumbers = invoiceNumbers;
    checkout.invoiceType = invoiceType;
    checkout.fetchedInvoices = fetchedInvoices;
    checkout.tallyResults = {
      itemsTaken,
      itemsSold,
      discrepancies
    };
    await checkout.save();

    console.log(`✓ Check work completed for checkout ${id}`);

    res.json({
      success: true,
      message: 'Check work completed successfully. Review the comparison and click Complete when ready.',
      data: {
        checkout,
        comparison: {
          itemsTaken,
          itemsSold,
          discrepancies
        },
        summary: {
          totalInvoices: invoiceNumbers.length,
          fetchedInvoices: fetchedInvoices.length,
          missingInvoices: invoiceNumbers.length - fetchedInvoices.length,
          totalItemsTaken: discrepancies.reduce((sum, item) => sum + item.quantityTaken, 0),
          totalItemsSold: discrepancies.reduce((sum, item) => sum + item.quantitySold, 0),
          matched: discrepancies.filter(d => d.status === 'matched').length,
          discrepancies: discrepancies.filter(d => d.status !== 'matched').length
        }
      }
    });
  } catch (error) {
    console.error('Check work error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check work',
      error: error.message
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});

// Cancel checkout
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const checkout = await TruckCheckout.findById(id);

    if (!checkout) {
      return res.status(404).json({
        success: false,
        message: 'Checkout not found'
      });
    }

    if (checkout.status !== 'checked_out') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel checkout with status: ${checkout.status}`
      });
    }

    await checkout.markCancelled(reason || 'Cancelled by user');

    console.log(`✓ Checkout ${id} cancelled`);

    res.json({
      success: true,
      message: 'Checkout cancelled successfully',
      data: checkout
    });
  } catch (error) {
    console.error('Cancel checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel checkout',
      error: error.message
    });
  }
});

// Update checkout
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow updating critical fields
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.status;
    delete updates.stockProcessed;

    const checkout = await TruckCheckout.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!checkout) {
      return res.status(404).json({
        success: false,
        message: 'Checkout not found'
      });
    }

    res.json({
      success: true,
      message: 'Checkout updated successfully',
      data: checkout
    });
  } catch (error) {
    console.error('Update checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update checkout',
      error: error.message
    });
  }
});

module.exports = router;
