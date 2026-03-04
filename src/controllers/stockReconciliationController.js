const stockReconciliationService = require('../services/stockReconciliation.service');


class StockReconciliationController {
  
  async getReconciliation(req, res, next) {
    try {
      const data = await stockReconciliationService.getReconciliation();

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Stock reconciliation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch stock reconciliation',
        error: error.message
      });
    }
  }
}

module.exports = new StockReconciliationController();
