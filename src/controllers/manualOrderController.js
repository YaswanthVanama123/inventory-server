const manualOrderService = require('../services/manualOrder.service');

class ManualOrderController {
  async createManualOrder(req, res, next) {
    try {
      const order = await manualOrderService.createManualOrder(
        req.body,
        req.user._id
      );
      res.status(201).json({
        success: true,
        message: 'Manual order created successfully',
        data: order
      });
    } catch (error) {
      console.error('Error creating manual order:', error);
      if (error.message.includes('required') || error.message.includes('must be')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to create manual order',
        error: error.message
      });
    }
  }

  async getNextOrderNumber(req, res, next) {
    try {
      const orderNumber = await manualOrderService.getNextOrderNumber();
      res.json({
        success: true,
        data: { orderNumber }
      });
    } catch (error) {
      console.error('Error generating order number:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate order number',
        error: error.message
      });
    }
  }

  async getManualOrderByNumber(req, res, next) {
    try {
      const order = await manualOrderService.getManualOrderByNumber(
        req.params.orderNumber
      );
      res.json({
        success: true,
        data: order
      });
    } catch (error) {
      console.error('Error fetching manual order:', error);
      if (error.message === 'Manual order not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to fetch manual order',
        error: error.message
      });
    }
  }

  async getAllManualOrders(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        vendor: req.query.vendor
      };

      const data = await manualOrderService.getAllManualOrders(filters);
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching manual orders:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch manual orders',
        error: error.message
      });
    }
  }

  async updateManualOrder(req, res, next) {
    try {
      const order = await manualOrderService.updateManualOrder(
        req.params.orderNumber,
        req.body,
        req.user._id
      );
      res.json({
        success: true,
        message: 'Manual order updated successfully',
        data: order
      });
    } catch (error) {
      console.error('Error updating manual order:', error);
      if (error.message === 'Manual order not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      if (error.message.includes('required') || error.message.includes('must be')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to update manual order',
        error: error.message
      });
    }
  }

  async deleteManualOrder(req, res, next) {
    try {
      const order = await manualOrderService.deleteManualOrder(
        req.params.orderNumber,
        req.user._id
      );
      res.json({
        success: true,
        message: 'Manual order deleted successfully',
        data: order
      });
    } catch (error) {
      console.error('Error deleting manual order:', error);
      if (error.message === 'Manual order not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to delete manual order',
        error: error.message
      });
    }
  }
}

module.exports = new ManualOrderController();
