const truckCheckoutService = require('../services/truckCheckout.service');
const stockCalculationService = require('../services/stockCalculation.service');
const stockService = require('../services/stock.service');


class TruckCheckoutController {
  async createCheckout(req, res, next) {
    try {
      const result = await truckCheckoutService.createCheckout(
        req.body,
        req.user?.id || req.user?.username || 'system'
      );
      if (!result.success) {
        return res.status(200).json(result);
      }
      res.status(201).json({
        success: true,
        message: result.message,
        data: {
          checkout: result.checkout,
          stockUpdate: result.stockUpdate,
          discrepancy: result.discrepancy
        }
      });
    } catch (error) {
      console.error('Create checkout error:', error);
      next(error);
    }
  }
  async getCheckouts(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        employeeName: req.query.employeeName,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };
      const pagination = {
        page: req.query.page,
        limit: req.query.limit
      };
      const result = await truckCheckoutService.getCheckouts(filters, pagination);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get checkouts error:', error);
      next(error);
    }
  }
  async getCheckoutById(req, res, next) {
    try {
      const checkout = await truckCheckoutService.getCheckoutById(req.params.id);
      res.json({
        success: true,
        data: checkout
      });
    } catch (error) {
      if (error.message === 'Checkout not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      console.error('Get checkout error:', error);
      next(error);
    }
  }
  async deleteCheckout(req, res, next) {
    try {
      const result = await truckCheckoutService.deleteCheckout(req.params.id);
      res.json(result);
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('Cannot delete')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      console.error('Delete checkout error:', error);
      next(error);
    }
  }
  async searchItems(req, res, next) {
    try {
      const searchQuery = req.query.q || '';

      const stockResult = await stockService.getStockSummary();
      const sellStock = stockResult.sellStock;
      const useStock = stockResult.useStock;

      console.log(`[TruckCheckout] Loaded ${sellStock.items.length} sell + ${useStock.items.length} use items`);

      const expandedItems = [];
      const seenNames = new Set();

      const addItem = (item, itemType) => {
        const stockRemaining = item.stockRemaining || 0;

        const canonicalKey = item.categoryName.toLowerCase();
        if (!seenNames.has(canonicalKey)) {
          seenNames.add(canonicalKey);
          expandedItems.push({
            itemName: item.categoryName,
            sku: item.categoryName,
            currentStock: stockRemaining,
            totalPurchased: item.totalPurchased || 0,
            totalSold: item.totalSold || 0,
            totalCheckedOut: item.totalCheckedOut || 0,
            totalDiscrepancies: item.totalDiscrepancies || 0,
            totalDiscrepancyDifference: item.totalDiscrepancyDifference || 0,
            unit: 'pieces',
            category: item.categoryName,
            department: item.categoryName,
            itemType
          });
        }

        if (item.aliases && Array.isArray(item.aliases)) {
          item.aliases.forEach(aliasName => {
            const aliasKey = aliasName.toLowerCase();
            if (!seenNames.has(aliasKey)) {
              seenNames.add(aliasKey);
              expandedItems.push({
                itemName: aliasName,
                sku: aliasName,
                currentStock: stockRemaining,
                totalPurchased: item.totalPurchased || 0,
                totalSold: item.totalSold || 0,
                totalCheckedOut: item.totalCheckedOut || 0,
                totalDiscrepancies: item.totalDiscrepancies || 0,
                totalDiscrepancyDifference: item.totalDiscrepancyDifference || 0,
                unit: 'pieces',
                category: item.categoryName,
                department: item.categoryName,
                itemType
              });
            }
          });
        }
      };

      sellStock.items.forEach(item => addItem(item, 'sell'));
      useStock.items.forEach(item => addItem(item, 'use'));

      let filteredItems = expandedItems;
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        filteredItems = expandedItems.filter(item =>
          item.itemName.toLowerCase().includes(queryLower)
        );
      }

      filteredItems.sort((a, b) => a.itemName.localeCompare(b.itemName));

      console.log(`[TruckCheckout] Returning ${filteredItems.length} items`);

      res.json({
        success: true,
        data: filteredItems
      });
    } catch (error) {
      console.error('[TruckCheckout searchItems] Error:', error);
      next(error);
    }
  }
  async getItemStock(req, res, next) {
    try {
      const stock = await stockCalculationService.getCurrentStock(req.params.itemName);
      res.json({
        success: true,
        data: stock
      });
    } catch (error) {
      console.error('Get stock error:', error);
      next(error);
    }
  }
  async getActiveCheckouts(req, res, next) {
    try {
      const result = await truckCheckoutService.getCheckouts(
        { status: 'checked_out' },
        { page: 1, limit: 1000 }
      );
      res.json({
        success: true,
        data: result.checkouts
      });
    } catch (error) {
      console.error('Get active checkouts error:', error);
      next(error);
    }
  }
  async getCheckoutsByEmployee(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const result = await truckCheckoutService.getCheckouts(
        { employeeName: req.params.employeeName },
        { page: 1, limit }
      );
      res.json({
        success: true,
        data: result.checkouts
      });
    } catch (error) {
      console.error('Get employee checkouts error:', error);
      next(error);
    }
  }
  async getEmployeeStats(req, res, next) {
    try {
      const TruckCheckout = require('../models/TruckCheckout');
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
      next(error);
    }
  }
  async getCheckoutSalesTracking(req, res, next) {
    try {
      const result = await truckCheckoutService.getCheckoutSalesTracking(req.query);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get checkout sales tracking error:', error);
      next(error);
    }
  }
  async getAllEmployeesWithStats(req, res, next) {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search
      };
      const employees = await truckCheckoutService.getAllEmployeesWithStats(filters);
      res.status(200).json({
        success: true,
        data: employees
      });
    } catch (error) {
      console.error('Get all employees with stats error:', error);
      next(error);
    }
  }

  /**
   * Get current truck inventory for a specific truck and item
   * GET /api/truck-checkouts/truck-inventory/:truckNumber/:itemName
   */
  async getTruckInventory(req, res, next) {
    try {
      const { truckNumber, itemName } = req.params;
      const employeeName = req.query.employeeName || req.user?.fullName;

      if (!truckNumber || !itemName) {
        return res.status(400).json({
          success: false,
          message: 'Truck number and item name are required'
        });
      }

      const truckInventory = await truckCheckoutService.getTruckInventory(
        truckNumber,
        itemName,
        employeeName
      );

      res.status(200).json({
        success: true,
        data: truckInventory
      });
    } catch (error) {
      console.error('Get truck inventory error:', error);
      next(error);
    }
  }

  async getMyTruckInventory(req, res, next) {
    try {
      const TruckCheckout = require('../models/TruckCheckout');
      const TruckDiscrepancy = require('../models/TruckDiscrepancy');
      const RouteStarInvoice = require('../models/RouteStarInvoice');

      const user = req.user;
      const employeeName = user.fullName || user.username;
      const truckNumber = user.truckNumber;

      if (!truckNumber) {
        return res.json({
          success: true,
          data: { truckNumber: null, employeeName, items: [] },
          message: 'No truck number assigned to your account'
        });
      }

      // 1. All my checkouts on my truck — sum quantityTaking per itemName
      const checkouts = await TruckCheckout.find({
        employeeName,
        truckNumber,
        status: { $ne: 'cancelled' }
      }).lean();

      const byItem = new Map();
      const addToItem = (key, field, qty) => {
        const k = (key || '').trim();
        if (!k) return;
        if (!byItem.has(k)) {
          byItem.set(k, {
            itemName: k,
            totalCheckedOut: 0,
            totalSold: 0,
            discrepancyAdjustment: 0,
            remainingInTruck: 0
          });
        }
        byItem.get(k)[field] += Number(qty) || 0;
      };

      for (const co of checkouts) {
        if (co.itemName) {
          addToItem(co.itemName, 'totalCheckedOut', co.quantityTaking);
        }
        if (Array.isArray(co.itemsTaken)) {
          for (const it of co.itemsTaken) {
            addToItem(it.name, 'totalCheckedOut', it.quantity);
          }
        }
      }

      // 2. All approved truck discrepancies on my truck — sum signed difference
      const discrepancies = await TruckDiscrepancy.find({
        truckNumber,
        employeeName,
        status: 'Approved'
      }).lean();

      for (const d of discrepancies) {
        addToItem(d.itemName, 'discrepancyAdjustment', d.difference);
      }

      // 3. All invoices assigned to my truck — count lineItem quantities as sales
      const invoices = await RouteStarInvoice.find({
        assignedTo: new RegExp(`^${truckNumber}$`, 'i'),
        'lineItems.0': { $exists: true }
      })
        .select('lineItems')
        .lean();

      for (const inv of invoices) {
        for (const li of inv.lineItems || []) {
          addToItem(li.name, 'totalSold', li.quantity);
        }
      }

      // 4. Compute remaining for every item
      const items = Array.from(byItem.values())
        .map(it => ({
          ...it,
          remainingInTruck: (it.totalCheckedOut || 0) - (it.totalSold || 0) + (it.discrepancyAdjustment || 0)
        }))
        // Only include items the user actually checked out (skip pure sales of items they never loaded)
        .filter(it => it.totalCheckedOut > 0)
        .sort((a, b) => a.itemName.localeCompare(b.itemName));

      res.json({
        success: true,
        data: {
          truckNumber,
          employeeName,
          items,
          totals: {
            totalCheckedOut: items.reduce((s, i) => s + i.totalCheckedOut, 0),
            totalSold: items.reduce((s, i) => s + i.totalSold, 0),
            discrepancyAdjustment: items.reduce((s, i) => s + i.discrepancyAdjustment, 0),
            remainingInTruck: items.reduce((s, i) => s + i.remainingInTruck, 0)
          }
        }
      });
    } catch (error) {
      console.error('getMyTruckInventory error:', error);
      next(error);
    }
  }
}
module.exports = new TruckCheckoutController();
