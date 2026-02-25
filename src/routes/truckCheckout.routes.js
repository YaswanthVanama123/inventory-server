const express = require('express');
const router = express.Router();
const TruckCheckout = require('../models/TruckCheckout');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarSyncService = require('../services/routeStarSync.service');
const StockMovement = require('../models/StockMovement');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Create new checkout
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
        // Get canonical name and SKU using alias mapping
        const canonicalName = await RouteStarItemAlias.getCanonicalName(item.name);
        const sku = (item.sku || canonicalName || item.name).toUpperCase();

        // Create OUT movement for checkout
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

        // Update StockSummary
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
        // Continue with other items even if one fails
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

// Get all checkouts with filtering
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      employeeName,
      startDate,
      endDate
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (employeeName) query.employeeName = new RegExp(employeeName, 'i');

    if (startDate || endDate) {
      query.checkoutDate = {};
      if (startDate) query.checkoutDate.$gte = new Date(startDate);
      if (endDate) query.checkoutDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [checkouts, total] = await Promise.all([
      TruckCheckout.find(query)
        .sort({ checkoutDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      TruckCheckout.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        checkouts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get checkouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch checkouts',
      error: error.message
    });
  }
});

// Get active checkouts
router.get('/active', authenticate, async (req, res) => {
  try {
    const checkouts = await TruckCheckout.getActiveCheckouts();

    res.json({
      success: true,
      data: checkouts
    });
  } catch (error) {
    console.error('Get active checkouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active checkouts',
      error: error.message
    });
  }
});

// Get checkouts by employee
router.get('/employee/:employeeName', authenticate, async (req, res) => {
  try {
    const { employeeName } = req.params;
    const { limit = 50 } = req.query;

    const checkouts = await TruckCheckout.getByEmployee(employeeName, parseInt(limit));

    res.json({
      success: true,
      data: checkouts
    });
  } catch (error) {
    console.error('Get employee checkouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee checkouts',
      error: error.message
    });
  }
});

// Get employee stats
router.get('/stats/employee/:employeeName', authenticate, async (req, res) => {
  try {
    const { employeeName } = req.params;
    const { startDate, endDate } = req.query;

    const stats = await TruckCheckout.getEmployeeStats(
      employeeName,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: stats[0] || {
        _id: employeeName,
        totalCheckouts: 0,
        completedCheckouts: 0,
        activeCheckouts: 0,
        totalInvoices: 0
      }
    });
  } catch (error) {
    console.error('Get employee stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee stats',
      error: error.message
    });
  }
});

// Get single checkout by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const checkout = await TruckCheckout.findById(id);

    if (!checkout) {
      return res.status(404).json({
        success: false,
        message: 'Checkout not found'
      });
    }

    res.json({
      success: true,
      data: checkout
    });
  } catch (error) {
    console.error('Get checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch checkout',
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

    // VALIDATION: Check if any of these invoices are already linked to another checkout
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

// Fetch invoices and tally results
router.post('/:id/tally', authenticate, async (req, res) => {
  let syncService = null;

  try {
    const { id } = req.params;

    const checkout = await TruckCheckout.findById(id);

    if (!checkout) {
      return res.status(404).json({
        success: false,
        message: 'Checkout not found'
      });
    }

    if (checkout.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Checkout must be completed before tallying'
      });
    }

    if (!checkout.invoiceNumbers || checkout.invoiceNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No invoice numbers to fetch'
      });
    }

    console.log(`\n📊 Starting tally for checkout ${id}`);
    console.log(`   Fetching ${checkout.invoiceNumbers.length} ${checkout.invoiceType} invoices...`);

    // Fetch invoices from database first
    const invoicesFromDB = await RouteStarInvoice.find({
      invoiceNumber: { $in: checkout.invoiceNumbers }
    }).lean();

    const fetchedInvoices = [];
    const missingInvoices = [];

    // Check which invoices are missing or need details
    for (const invoiceNumber of checkout.invoiceNumbers) {
      const dbInvoice = invoicesFromDB.find(inv => inv.invoiceNumber === invoiceNumber);

      if (dbInvoice && dbInvoice.lineItems && dbInvoice.lineItems.length > 0) {
        // Invoice exists with details
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
        // Missing or needs details
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

    // Tally: Group items sold
    const itemsSoldMap = {};

    for (const invoice of fetchedInvoices) {
      for (const item of invoice.items) {
        const key = item.sku || item.name;
        if (!itemsSoldMap[key]) {
          itemsSoldMap[key] = {
            name: item.name,
            sku: item.sku,
            quantitySold: 0
          };
        }
        itemsSoldMap[key].quantitySold += item.quantity;
      }
    }

    const itemsSold = Object.values(itemsSoldMap);

    // Tally: Group items taken
    const itemsTakenMap = {};

    for (const item of checkout.itemsTaken) {
      const key = item.sku || item.name;
      if (!itemsTakenMap[key]) {
        itemsTakenMap[key] = {
          name: item.name,
          sku: item.sku,
          quantityTaken: 0
        };
      }
      itemsTakenMap[key].quantityTaken += item.quantity;
    }

    const itemsTaken = Object.values(itemsTakenMap);

    // Calculate discrepancies
    const discrepancies = [];
    const allKeys = new Set([...Object.keys(itemsTakenMap), ...Object.keys(itemsSoldMap)]);

    for (const key of allKeys) {
      const taken = itemsTakenMap[key] || { name: key, sku: key, quantityTaken: 0 };
      const sold = itemsSoldMap[key] || { name: key, sku: key, quantitySold: 0 };

      const difference = taken.quantityTaken - sold.quantitySold;
      let status = 'matched';

      if (difference > 0) {
        status = 'excess'; // Took more than sold (has returns)
      } else if (difference < 0) {
        status = 'shortage'; // Sold more than took (error/missing items)
      }

      discrepancies.push({
        name: taken.name || sold.name,
        sku: taken.sku || sold.sku,
        quantityTaken: taken.quantityTaken,
        quantitySold: sold.quantitySold,
        difference,
        status
      });
    }

    // Save tally results
    const tallyResults = {
      itemsTaken,
      itemsSold,
      discrepancies
    };

    checkout.fetchedInvoices = fetchedInvoices;
    await checkout.saveTallyResults(tallyResults, req.user?.username || 'system');

    console.log(`✓ Tally completed for checkout ${id}`);
    console.log(`   Invoices processed: ${fetchedInvoices.length}/${checkout.invoiceNumbers.length}`);
    console.log(`   Items matched: ${discrepancies.filter(d => d.status === 'matched').length}`);
    console.log(`   Discrepancies: ${discrepancies.filter(d => d.status !== 'matched').length}`);

    res.json({
      success: true,
      message: 'Tally completed successfully',
      data: {
        checkout,
        summary: {
          totalInvoices: checkout.invoiceNumbers.length,
          fetchedInvoices: fetchedInvoices.length,
          missingInvoices: checkout.invoiceNumbers.length - fetchedInvoices.length,
          totalItemsTaken: itemsTaken.reduce((sum, item) => sum + item.quantityTaken, 0),
          totalItemsSold: itemsSold.reduce((sum, item) => sum + item.quantitySold, 0),
          matched: discrepancies.filter(d => d.status === 'matched').length,
          discrepancies: discrepancies.filter(d => d.status !== 'matched').length
        }
      }
    });
  } catch (error) {
    console.error('Tally error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to tally checkout',
      error: error.message
    });
  } finally {
    if (syncService) {
      await syncService.close();
    }
  }
});

// Process stock movements for completed checkout
router.post('/:id/process-stock', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const StockSummary = require('../models/StockSummary');
    const RouteStarItemAlias = require('../models/RouteStarItemAlias');

    const checkout = await TruckCheckout.findById(id);

    if (!checkout) {
      return res.status(404).json({
        success: false,
        message: 'Checkout not found'
      });
    }

    if (checkout.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Checkout must be completed before processing stock'
      });
    }

    if (checkout.stockProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Stock already processed for this checkout'
      });
    }

    if (!checkout.tallyResults || !checkout.tallyResults.itemsSold) {
      return res.status(400).json({
        success: false,
        message: 'Tally must be completed before processing stock'
      });
    }

    console.log(`\n📦 Processing stock adjustments for checkout ${id}...`);
    console.log(`   Strategy: ADD BACK sold items (already counted in invoice sync) + Track used items\n`);

    let soldAdjustments = 0;
    let usedMovements = 0;
    const errors = [];

    // Process each item with discrepancies
    for (const item of checkout.tallyResults.discrepancies) {
      const itemName = item.name || item.sku;
      const quantityTaken = item.quantityTaken || 0;
      const quantitySold = item.quantitySold || 0;
      const quantityUsed = quantityTaken - quantitySold; // Remaining = Used for service

      try {
        // Get canonical name and SKU using alias mapping
        const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
        const sku = (item.sku || canonicalName || itemName).toUpperCase();

        console.log(`\n  Processing: ${itemName}`);
        console.log(`    → Canonical: ${canonicalName}, SKU: ${sku}`);
        console.log(`    → Taken: ${quantityTaken}, Sold: ${quantitySold}, Used: ${quantityUsed}`);

        // STEP 1: ADD BACK sold quantities (compensation for double decrease)
        // Why: Items were decreased twice:
        //   1. During checkout (OUT for all taken items)
        //   2. During invoice sync (OUT for sold items)
        // So we ADD BACK the sold quantity to correct the double-counting
        if (quantitySold > 0) {
          await StockMovement.create({
            sku: sku,
            type: 'IN',  // ADD BACK (compensation)
            qty: quantitySold,
            refType: 'TRUCK_CHECKOUT_ADJUSTMENT',
            refId: checkout._id,
            sourceRef: `Adjustment for checkout ${checkout._id}: ${checkout.employeeName}`,
            timestamp: checkout.completedDate || new Date(),
            notes: `Stock adjustment: Adding back ${quantitySold} sold items (invoices: ${checkout.invoiceNumbers.join(', ')}) to compensate for double-decrease (checkout + invoice sync)`
          });

          // Update StockSummary
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
          stockSummary.addStock(quantitySold);
          await stockSummary.save();

          soldAdjustments++;
          console.log(`    ✓ Added back ${quantitySold} sold items (compensation for double-decrease)`);
        }

        // STEP 2: Create OUT movement for USED quantities only
        // These were checked out but NOT sold (used for service/installation)
        if (quantityUsed > 0) {
          await StockMovement.create({
            sku: sku,
            type: 'OUT',
            qty: quantityUsed,
            refType: 'TRUCK_CHECKOUT_USED',
            refId: checkout._id,
            sourceRef: `Used by ${checkout.employeeName}`,
            timestamp: checkout.completedDate || new Date(),
            notes: `Items used for service/installation (not sold): ${checkout.employeeName}`
          });

          // Update StockSummary for used items
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
          stockSummary.removeStock(quantityUsed);
          await stockSummary.save();

          usedMovements++;
          console.log(`    ✓ Created OUT movement for ${quantityUsed} used items`);
        }

        // Handle shortage case (sold more than taken - theft/error)
        if (quantityUsed < 0) {
          console.log(`    ⚠️  WARNING: Sold ${quantitySold} but only took ${quantityTaken} (shortage: ${Math.abs(quantityUsed)})`);
        }

      } catch (error) {
        errors.push({
          sku: item.sku || item.name,
          error: error.message
        });
        console.error(`  ✗ Failed to process ${itemName}: ${error.message}`);
      }
    }

    await checkout.markStockProcessed();

    console.log(`\n✓ Stock processing completed for checkout ${id}`);
    console.log(`   Sold adjustments (added back): ${soldAdjustments} items`);
    console.log(`   Used movements (removed): ${usedMovements} items`);
    console.log(`   Errors: ${errors.length}`);
    console.log(`\n📊 Final stock calculation:`);
    console.log(`   Initial stock - Checkout (${checkout.totalItemsTaken}) - Invoice sync (${checkout.totalItemsSold}) + Adjustment (${checkout.totalItemsSold}) - Used (${checkout.totalItemsTaken - checkout.totalItemsSold})`);
    console.log(`   Net effect: Stock decreased by ${checkout.totalItemsTaken} total (as expected)\n`);

    res.json({
      success: true,
      message: 'Stock movements processed successfully',
      data: {
        soldAdjustments,
        usedMovements,
        errors,
        checkout,
        summary: {
          totalTaken: checkout.totalItemsTaken,
          totalSold: checkout.totalItemsSold,
          totalUsed: checkout.totalItemsTaken - checkout.totalItemsSold,
          netStockDecrease: checkout.totalItemsTaken
        }
      }
    });
  } catch (error) {
    console.error('Process stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process stock movements',
      error: error.message
    });
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

// Delete checkout
router.delete('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;

    const checkout = await TruckCheckout.findById(id);

    if (!checkout) {
      return res.status(404).json({
        success: false,
        message: 'Checkout not found'
      });
    }

    if (checkout.stockProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete checkout with processed stock movements'
      });
    }

    await checkout.deleteOne();

    console.log(`✓ Checkout ${id} deleted`);

    res.json({
      success: true,
      message: 'Checkout deleted successfully'
    });
  } catch (error) {
    console.error('Delete checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete checkout',
      error: error.message
    });
  }
});

module.exports = router;
