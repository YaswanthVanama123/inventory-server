const stockReconciliationService = require('../services/stockReconciliation.service');

/**
 * Stock Reconciliation Controller
 * Handles HTTP requests for stock reconciliation operations
 */
class StockReconciliationController {
  /**
   * Get stock reconciliation report
   * GET /api/stock-reconciliation
   */
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
