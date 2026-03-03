const stockCalculationService = require('../services/stockCalculation.service');
const stockService = require('../services/stock.service');

/**
 * Stock Controller
 * Handles HTTP requests for stock operations
 */
class StockController {
  /**
   * Get SKUs for a category
   * GET /api/stock/category/:categoryName/skus
   */
  async getCategorySkus(req, res, next) {
    try {
      const { categoryName } = req.params;

      const result = await stockService.getCategorySkus(categoryName);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching category SKUs:', error);
      next(error);
    }
  }

  /**
   * Get sales data for a category
   * GET /api/stock/category/:categoryName/sales
   */
  async getCategorySales(req, res, next) {
    try {
      const { categoryName } = req.params;

      const result = await stockService.getCategorySales(categoryName);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching category sales:', error);
      next(error);
    }
  }

  /**
   * Get forUse stock data
   * GET /api/stock/use
   */
  async getUseStock(req, res, next) {
    try {
      const result = await stockService.getUseStock();

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching use stock:', error);
      next(error);
    }
  }

  /**
   * Get forSell stock data
   * GET /api/stock/sell
   */
  async getSellStock(req, res, next) {
    try {
      const result = await stockService.getSellStock();

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching sell stock:', error);
      next(error);
    }
  }

  /**
   * Get complete stock summary (use + sell)
   * GET /api/stock/summary
   */
  async getStockSummary(req, res, next) {
    try {
      const result = await stockService.getStockSummary();

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching stock summary:', error);
      next(error);
    }
  }
}

module.exports = new StockController();
