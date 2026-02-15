const express = require('express');
const router = express.Router();
const RouteStarItem = require('../models/RouteStarItem');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const { authenticate } = require('../middleware/auth');


let isSyncing = false;





router.get('/stats', authenticate, async (req, res) => {
  try {
    const total = await RouteStarItem.countDocuments();
    const forUseCount = await RouteStarItem.countDocuments({ forUse: true });
    const forSellCount = await RouteStarItem.countDocuments({ forSell: true });
    const bothCount = await RouteStarItem.countDocuments({ forUse: true, forSell: true });
    const unmarkedCount = await RouteStarItem.countDocuments({ forUse: false, forSell: false });

    res.json({
      success: true,
      data: {
        total,
        forUse: forUseCount,
        forSell: forSellCount,
        both: bothCount,
        unmarked: unmarkedCount
      }
    });
  } catch (error) {
    console.error('Error fetching item stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});





router.get('/', authenticate, async (req, res) => {
  try {
    const {
      search,
      itemParent,
      type,
      itemCategory,
      forUse,
      forSell,
      page = 1,
      limit = 50,
      sortBy = 'itemName',
      sortOrder = 'asc'
    } = req.query;

    
    const query = {};

    
    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { itemParent: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    
    if (itemParent && itemParent !== 'all') {
      query.itemParent = itemParent;
    }

    
    if (type && type !== 'all') {
      query.type = type;
    }

    
    if (forUse === 'true') {
      query.forUse = true;
    }

    
    if (forSell === 'true') {
      query.forSell = true;
    }

    
    if (itemCategory && itemCategory !== 'all') {
      query.itemCategory = itemCategory;
    }

    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    
    const items = await RouteStarItem.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    
    const total = await RouteStarItem.countDocuments(query);

    
    const itemParents = await RouteStarItem.distinct('itemParent');

    
    const types = await RouteStarItem.distinct('type');

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        },
        filters: {
          itemParents: itemParents.filter(p => p).sort(),
          types: types.filter(t => t).sort()
        }
      }
    });
  } catch (error) {
    console.error('Error fetching RouteStarItems:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items',
      error: error.message
    });
  }
});





router.patch('/:id/flags', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { forUse, forSell, itemCategory } = req.body;

    const item = await RouteStarItem.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    
    if (forUse !== undefined) {
      item.forUse = forUse;
    }

    if (forSell !== undefined) {
      item.forSell = forSell;
    }

    
    if (itemCategory !== undefined && ['Service', 'Item'].includes(itemCategory)) {
      item.itemCategory = itemCategory;
    }

    await item.save();

    res.json({
      success: true,
      message: 'Item updated successfully',
      data: item
    });
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item',
      error: error.message
    });
  }
});





router.delete('/all', authenticate, async (req, res) => {
  try {
    const result = await RouteStarItem.deleteMany({});

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} items`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Error deleting all items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete items',
      error: error.message
    });
  }
});





router.post('/sync', authenticate, async (req, res) => {
  
  if (isSyncing) {
    return res.status(409).json({
      success: false,
      message: 'Sync already in progress. Please wait for the current sync to complete.',
      error: 'SYNC_IN_PROGRESS'
    });
  }

  
  isSyncing = true;

  try {
    const RouteStarSyncService = require('../services/routeStarSync.service');
    const syncService = new RouteStarSyncService();

    
    await syncService.init();

    
    const result = await syncService.syncItems(Infinity);

    
    await syncService.close();

    res.json({
      success: true,
      message: 'Items synced successfully',
      data: result
    });
  } catch (error) {
    console.error('Error syncing items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync items',
      error: error.message
    });
  } finally {
    
    isSyncing = false;
  }
});





router.get('/sales-report', authenticate, async (req, res) => {
  try {
    
    const items = await RouteStarItem.find().sort({ itemName: 1 }).lean();

    
    
    const invoices = await RouteStarInvoice.find({
      status: { $in: ['Completed', 'Closed', 'Pending'] }
    }).lean();

    console.log('\n=== SALES REPORT DEBUG ===');
    console.log('Total RouteStar items:', items.length);
    console.log('Total invoices (filtered):', invoices.length);
    console.log('Sample RouteStar item names:', items.slice(0, 5).map(i => i.itemName));

    
    const allInvoices = await RouteStarInvoice.find({}).lean();
    console.log('Total invoices (unfiltered):', allInvoices.length);
    console.log('Sample invoice statuses:', allInvoices.slice(0, 5).map(inv => ({
      number: inv.invoiceNumber,
      status: inv.status,
      isComplete: inv.isComplete
    })));

    
    const nrv7840 = await RouteStarInvoice.findOne({ invoiceNumber: 'NRV7840' }).lean();
    if (nrv7840) {
      console.log('NRV7840 found:', {
        status: nrv7840.status,
        isComplete: nrv7840.isComplete,
        lineItemCount: nrv7840.lineItems?.length || 0
      });
    } else {
      console.log('NRV7840 NOT found in database');
    }

    
    const salesMap = {};

    
    let totalLineItems = 0;
    const uniqueInvoiceItemNames = new Set();

    invoices.forEach(invoice => {
      if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
        invoice.lineItems.forEach(lineItem => {
          totalLineItems++;
          const itemName = lineItem.name ? lineItem.name.trim() : '';

          if (itemName) {
            uniqueInvoiceItemNames.add(itemName);
          }

          if (itemName) {
            if (!salesMap[itemName]) {
              salesMap[itemName] = {
                totalQuantity: 0,
                totalAmount: 0,
                invoiceCount: 0,
                invoices: [],
                invoiceDetails: []
              };
            }

            salesMap[itemName].totalQuantity += lineItem.quantity || 0;
            salesMap[itemName].totalAmount += lineItem.amount || 0;

            
            if (!salesMap[itemName].invoices.includes(invoice.invoiceNumber)) {
              salesMap[itemName].invoices.push(invoice.invoiceNumber);
              salesMap[itemName].invoiceCount += 1;
            }

            
            salesMap[itemName].invoiceDetails.push({
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              quantity: lineItem.quantity,
              rate: lineItem.rate,
              amount: lineItem.amount,
              customer: invoice.customer?.name || '',
              status: invoice.status
            });
          }
        });
      }
    });

    console.log('Total invoice line items:', totalLineItems);
    console.log('Unique invoice item names:', uniqueInvoiceItemNames.size);
    console.log('Sample invoice item names:', Array.from(uniqueInvoiceItemNames).slice(0, 10));
    console.log('Items in salesMap:', Object.keys(salesMap).length);
    console.log('=== END DEBUG ===\n');

    
    const itemsWithSales = items.map(item => {
      const salesData = salesMap[item.itemName] || {
        totalQuantity: 0,
        totalAmount: 0,
        invoiceCount: 0,
        invoiceDetails: []
      };

      return {
        _id: item._id,
        itemName: item.itemName,
        itemParent: item.itemParent,
        description: item.description,
        itemCategory: item.itemCategory,
        qtyOnHand: item.qtyOnHand,
        forUse: item.forUse,
        forSell: item.forSell,
        soldQuantity: salesData.totalQuantity,
        soldAmount: salesData.totalAmount,
        invoiceCount: salesData.invoiceCount,
        invoiceDetails: salesData.invoiceDetails
      };
    });

    
    const totals = itemsWithSales.reduce((acc, item) => ({
      totalItems: acc.totalItems + 1,
      totalSoldQuantity: acc.totalSoldQuantity + item.soldQuantity,
      totalSoldAmount: acc.totalSoldAmount + item.soldAmount,
      totalInvoices: acc.totalInvoices + item.invoiceCount
    }), {
      totalItems: 0,
      totalSoldQuantity: 0,
      totalSoldAmount: 0,
      totalInvoices: 0
    });

    res.json({
      success: true,
      data: {
        items: itemsWithSales,
        totals
      }
    });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales report',
      error: error.message
    });
  }
});

module.exports = router;
