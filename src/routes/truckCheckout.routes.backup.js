const express = require('express');
const router = express.Router();
const TruckCheckout = require('../models/TruckCheckout');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarSyncService = require('../services/routeStarSync.service');
const StockMovement = require('../models/StockMovement');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const { authenticate, requireAdmin } = require('../middleware/auth');


async function getCurrentStock(itemName) {
  const RouteStarItemAlias = require('../models/RouteStarItemAlias');
  const StockSummary = require('../models/StockSummary');
  const CustomerConnectOrder = require('../models/CustomerConnectOrder');
  const RouteStarInvoice = require('../models/RouteStarInvoice');
  const TruckCheckout = require('../models/TruckCheckout');
  const ModelCategory = require('../models/ModelCategory');

  try {
    
    const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
    const sku = (canonicalName || itemName).toUpperCase();

    
    let stockSummary = await StockSummary.findOne({ sku });

    if (!stockSummary) {
      
      
      const mappings = await ModelCategory.find({ categoryItemName: canonicalName }).lean();
      const skus = mappings.map(m => m.modelNumber);

      let totalPurchased = 0;
      if (skus.length > 0) {
        const orders = await CustomerConnectOrder.find({
          status: { $in: ['Complete', 'Processing', 'Shipped'] },
          'items.sku': { $in: skus }
        }).lean();

        orders.forEach(order => {
          order.items?.forEach(item => {
            if (skus.includes(item.sku?.toUpperCase())) {
              totalPurchased += item.qty || 0;
            }
          });
        });
      }

      
      const aliasMap = await RouteStarItemAlias.buildLookupMap();
      const variations = [canonicalName, canonicalName.toLowerCase()];
      Object.keys(aliasMap).forEach(alias => {
        if (aliasMap[alias] === canonicalName) {
          variations.push(alias);
        }
      });

      const invoices = await RouteStarInvoice.find({
        status: { $in: ['Completed', 'Closed', 'Pending'] },
        'lineItems.name': { $in: variations }
      }).lean();

      let totalSold = 0;
      invoices.forEach(invoice => {
        invoice.lineItems?.forEach(item => {
          const itemCanonical = aliasMap[item.name?.toLowerCase()] || item.name;
          if (itemCanonical === canonicalName) {
            totalSold += item.quantity || 0;
          }
        });
      });

      
      const checkouts = await TruckCheckout.find({
        status: 'checked_out',
        itemName: { $in: variations }
      }).lean();

      let totalCheckedOut = 0;
      checkouts.forEach(checkout => {
        if (checkout.quantityTaking) {
          totalCheckedOut += checkout.quantityTaking;
        } else if (checkout.itemsTaken?.length > 0) {
          checkout.itemsTaken.forEach(item => {
            const itemCanonical = aliasMap[item.name?.toLowerCase()] || item.name;
            if (itemCanonical === canonicalName) {
              totalCheckedOut += item.quantity || 0;
            }
          });
        }
      });

      
      const discrepancies = await StockDiscrepancy.find({
        categoryName: canonicalName,
        status: 'Approved'
      }).lean();

      let totalDiscrepancyAdjustment = 0;
      discrepancies.forEach(d => {
        totalDiscrepancyAdjustment += d.difference || 0;
      });

      const availableQty = totalPurchased - totalSold - totalCheckedOut + totalDiscrepancyAdjustment;

      return {
        sku,
        canonicalName,
        availableQty,
        totalPurchased,
        totalSold,
        totalCheckedOut,
        totalDiscrepancyAdjustment
      };
    }

    return {
      sku,
      canonicalName,
      availableQty: stockSummary.availableQty,
      totalInQty: stockSummary.totalInQty,
      totalOutQty: stockSummary.totalOutQty
    };
  } catch (error) {
    console.error('Error calculating current stock:', error);
    throw error;
  }
}


router.post('/create-new', authenticate, async (req, res) => {
  try {
    const {
      employeeName,
      employeeId,
      truckNumber,
      itemName,
      quantityTaking,
      remainingQuantity,
      notes,
      checkoutDate,
      acceptDiscrepancy = false  
    } = req.body;

    
    if (!employeeName || !itemName || quantityTaking === undefined || remainingQuantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Employee name, item name, quantity taking, and remaining quantity are required'
      });
    }

    if (quantityTaking < 0 || remainingQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantities cannot be negative'
      });
    }

    console.log(`\n📦 Creating new checkout for ${employeeName}`);
    console.log(`   Item: ${itemName}, Taking: ${quantityTaking}, Remaining: ${remainingQuantity}`);

    
    const currentStock = await getCurrentStock(itemName);
    console.log(`   Current stock: ${currentStock.availableQty}`);

    
    const systemCalculatedRemaining = currentStock.availableQty - quantityTaking;
    console.log(`   Expected remaining: ${systemCalculatedRemaining}`);

    
    const hasDiscrepancy = remainingQuantity !== systemCalculatedRemaining;
    const discrepancyDifference = remainingQuantity - systemCalculatedRemaining;

    if (hasDiscrepancy && !acceptDiscrepancy) {
      
      return res.status(200).json({
        success: false,
        requiresConfirmation: true,
        message: 'Stock discrepancy detected. Please confirm to proceed.',
        data: {
          itemName,
          currentStock: currentStock.availableQty,
          quantityTaking,
          systemCalculatedRemaining,
          userEnteredRemaining: remainingQuantity,
          discrepancyDifference,
          discrepancyType: discrepancyDifference > 0 ? 'Overage' : 'Shortage'
        }
      });
    }

    
    const checkout = await TruckCheckout.create({
      employeeName,
      employeeId,
      truckNumber,
      itemName,
      quantityTaking,
      remainingQuantity,
      systemCalculatedRemaining,
      hasDiscrepancy,
      discrepancyAccepted: hasDiscrepancy && acceptDiscrepancy,
      notes,
      checkoutDate: checkoutDate || new Date(),
      createdBy: req.user?.username || 'system',
      status: 'checked_out',
      itemsTaken: []  
    });

    console.log(`   ✓ Checkout created: ${checkout._id}`);

    
    if (hasDiscrepancy && acceptDiscrepancy) {
      const discrepancy = await StockDiscrepancy.create({
        invoiceNumber: `CHECKOUT-${checkout._id}`,
        invoiceType: 'TruckCheckout',
        itemName,
        categoryName: currentStock.canonicalName || itemName,
        systemQuantity: systemCalculatedRemaining,
        actualQuantity: remainingQuantity,
        discrepancyType: discrepancyDifference > 0 ? 'Overage' : 'Shortage',
        reason: 'Truck checkout stock validation',
        notes: `Checkout by ${employeeName} - Truck ${truckNumber || 'N/A'}. System expected ${systemCalculatedRemaining}, user entered ${remainingQuantity}.`,
        reportedBy: req.user?.id,
        status: 'Approved'  
      });

      checkout.discrepancyId = discrepancy._id;
      await checkout.save();

      console.log(`   ✓ Discrepancy created and auto-approved: ${discrepancy._id}`);
    }

    
    const RouteStarItemAlias = require('../models/RouteStarItemAlias');
    const StockSummary = require('../models/StockSummary');

    const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
    const sku = (canonicalName || itemName).toUpperCase();

    await StockMovement.create({
      sku: sku,
      type: 'OUT',
      qty: quantityTaking,
      refType: 'TRUCK_CHECKOUT',
      refId: checkout._id,
      sourceRef: `Checkout to ${employeeName} - Truck ${truckNumber || 'N/A'}`,
      timestamp: checkout.checkoutDate,
      notes: `Checked out to truck: ${employeeName}${notes ? ` (${notes})` : ''}`
    });

    
    let stockSummary = await StockSummary.findOne({ sku });
    if (!stockSummary) {
      stockSummary = await StockSummary.create({
        sku,
        availableQty: currentStock.availableQty || 0,
        reservedQty: 0,
        totalInQty: 0,
        totalOutQty: 0,
        lowStockThreshold: 10
      });
    }

    
    stockSummary.removeStock(quantityTaking);

    
    if (hasDiscrepancy && acceptDiscrepancy) {
      if (discrepancyDifference > 0) {
        
        stockSummary.addStock(discrepancyDifference);
        console.log(`   ✓ Discrepancy adjustment: +${discrepancyDifference}`);
      } else {
        
        stockSummary.removeStock(Math.abs(discrepancyDifference));
        console.log(`   ✓ Discrepancy adjustment: ${discrepancyDifference}`);
      }
    }

    await stockSummary.save();

    console.log(`   ✓ Stock updated: ${sku} = ${stockSummary.availableQty}\n`);

    res.status(201).json({
      success: true,
      message: hasDiscrepancy
        ? 'Checkout created with discrepancy adjustment'
        : 'Checkout created successfully',
      data: {
        checkout,
        stockUpdate: {
          sku,
          previousStock: currentStock.availableQty,
          quantityTaken: quantityTaking,
          discrepancyAdjustment: hasDiscrepancy ? discrepancyDifference : 0,
          newStock: stockSummary.availableQty
        }
      }
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


router.get('/items/search', authenticate, async (req, res) => {
  try {
    const { q = '', forSell = 'true' } = req.query;
    const RouteStarItem = require('../models/RouteStarItem');

    const query = {};

    if (forSell === 'true') {
      query.forSell = true;
    }

    if (q) {
      query.itemName = new RegExp(q, 'i');
    }

    const items = await RouteStarItem.find(query)
      .select('itemName itemParent qtyOnHand')
      .sort({ itemName: 1 })
      .limit(100)
      .lean();

    
    const itemsWithStock = await Promise.all(
      items.map(async (item) => {
        try {
          const stock = await getCurrentStock(item.itemName);
          return {
            itemName: item.itemName,
            itemParent: item.itemParent,
            qtyOnHand: item.qtyOnHand,
            currentStock: stock.availableQty
          };
        } catch (error) {
          return {
            itemName: item.itemName,
            itemParent: item.itemParent,
            qtyOnHand: item.qtyOnHand,
            currentStock: 0
          };
        }
      })
    );

    res.json({
      success: true,
      data: itemsWithStock
    });
  } catch (error) {
    console.error('Search items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search items',
      error: error.message
    });
  }
});


router.get('/stock/:itemName', authenticate, async (req, res) => {
  try {
    const { itemName } = req.params;

    const stock = await getCurrentStock(itemName);

    res.json({
      success: true,
      data: stock
    });
  } catch (error) {
    console.error('Get stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stock',
      error: error.message
    });
  }
});


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

    
    await recordStockMovementsForCheckout(checkout);

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


async function recordStockMovementsForCheckout(checkout) {
  const Stock = require('../models/Stock');
  const RouteStarItemAlias = require('../models/RouteStarItemAlias');

  
  const aliasMap = await RouteStarItemAlias.buildLookupMap();

  
  if (checkout.fetchedInvoices && checkout.fetchedInvoices.length > 0) {
    for (const invoice of checkout.fetchedInvoices) {
      for (const item of invoice.items) {
        
        const canonicalName = aliasMap[item.name.toLowerCase()] || item.name;

        
        await Stock.create({
          itemName: canonicalName,
          originalItemName: item.name,
          quantity: -item.quantity, 
          type: 'truck_checkout_invoice',
          source: 'routestar',
          sourceId: invoice.invoiceNumber,
          checkoutId: checkout._id,
          employeeName: checkout.employeeName,
          notes: `Invoice ${invoice.invoiceNumber} - Stock already decreased during checkout`,
          alreadyProcessed: true, 
          processedBy: 'system',
          processedAt: new Date()
        });
      }
    }
  }
}


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

    for (const item of checkout.itemsTaken) {
      
      const canonicalName = aliasMap[item.name.toLowerCase()] || item.name;
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
    const checkedOutKeys = Object.keys(itemsTakenMap); 

    for (const key of checkedOutKeys) {
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
    console.log(`   Invoices processed: ${fetchedInvoices.length}/${invoiceNumbers.length}`);
    console.log(`   Items matched: ${discrepancies.filter(d => d.status === 'matched').length}`);
    console.log(`   Discrepancies: ${discrepancies.filter(d => d.status !== 'matched').length}`);

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

    
    const invoicesFromDB = await RouteStarInvoice.find({
      invoiceNumber: { $in: checkout.invoiceNumbers }
    }).lean();

    const fetchedInvoices = [];
    const missingInvoices = [];

    
    for (const invoiceNumber of checkout.invoiceNumbers) {
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

    for (const item of checkout.itemsTaken) {
      
      const canonicalName = aliasMap[item.name.toLowerCase()] || item.name;
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
    const checkedOutKeys = Object.keys(itemsTakenMap); 

    for (const key of checkedOutKeys) {
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

    
    for (const item of checkout.tallyResults.discrepancies) {
      const itemName = item.name || item.sku;
      const quantityTaken = item.quantityTaken || 0;
      const quantitySold = item.quantitySold || 0;
      const quantityUsed = quantityTaken - quantitySold; 

      try {
        
        const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
        const sku = (item.sku || canonicalName || itemName).toUpperCase();

        console.log(`\n  Processing: ${itemName}`);
        console.log(`    → Canonical: ${canonicalName}, SKU: ${sku}`);
        console.log(`    → Taken: ${quantityTaken}, Sold: ${quantitySold}, Used: ${quantityUsed}`);

        
        
        
        
        
        if (quantitySold > 0) {
          await StockMovement.create({
            sku: sku,
            type: 'IN',  
            qty: quantitySold,
            refType: 'TRUCK_CHECKOUT_ADJUSTMENT',
            refId: checkout._id,
            sourceRef: `Adjustment for checkout ${checkout._id}: ${checkout.employeeName}`,
            timestamp: checkout.completedDate || new Date(),
            notes: `Stock adjustment: Adding back ${quantitySold} sold items (invoices: ${checkout.invoiceNumbers.join(', ')}) to compensate for double-decrease (checkout + invoice sync)`
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
          stockSummary.addStock(quantitySold);
          await stockSummary.save();

          soldAdjustments++;
          console.log(`    ✓ Added back ${quantitySold} sold items (compensation for double-decrease)`);
        }

        
        
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


router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    
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


router.delete('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const StockSummary = require('../models/StockSummary');

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

    console.log(`\n🗑️  Deleting checkout ${id}...`);
    console.log(`   Reversing stock movements for ${checkout.itemsTaken?.length || 0} items...`);

    
    for (const item of checkout.itemsTaken || []) {
      if (item.quantity <= 0) continue;

      try {
        const RouteStarItemAlias = require('../models/RouteStarItemAlias');
        const canonicalName = await RouteStarItemAlias.getCanonicalName(item.name);
        const sku = (item.sku || canonicalName || item.name).toUpperCase();

        
        await StockMovement.deleteMany({
          refType: 'TRUCK_CHECKOUT',
          refId: checkout._id,
          sku: sku
        });

        
        let stockSummary = await StockSummary.findOne({ sku });
        if (stockSummary) {
          stockSummary.addStock(item.quantity);
          await stockSummary.save();
          console.log(`   ✓ Reversed ${sku}: +${item.quantity}`);
        }
      } catch (error) {
        console.error(`   ✗ Failed to reverse stock for ${item.name}: ${error.message}`);
      }
    }

    
    if (checkout.status === 'completed') {
      await StockMovement.deleteMany({
        refType: 'TRUCK_CHECKOUT_ADJUSTMENT',
        refId: checkout._id
      });
      await StockMovement.deleteMany({
        refType: 'TRUCK_CHECKOUT_USED',
        refId: checkout._id
      });
      console.log(`   ✓ Deleted invoice-related stock movements`);
    }

    await checkout.deleteOne();

    console.log(`✓ Checkout ${id} deleted and stock reversed\n`);

    res.json({
      success: true,
      message: 'Checkout deleted successfully and stock movements reversed'
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
