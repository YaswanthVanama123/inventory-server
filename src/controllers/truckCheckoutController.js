const truckCheckoutService = require('../services/truckCheckout.service');
const stockCalculationService = require('../services/stockCalculation.service');


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
      const options = {
        q: req.query.q || '',
        forSell: req.query.forSell === 'true',
        limit: parseInt(req.query.limit) || 100
      };

      const items = await stockCalculationService.searchItemsWithStock(options);

      res.json({
        success: true,
        data: items
      });
    } catch (error) {
      console.error('Search items error:', error);
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
}

module.exports = new TruckCheckoutController();
