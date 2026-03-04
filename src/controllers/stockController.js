const stockCalculationService = require('../services/stockCalculation.service');
const stockService = require('../services/stock.service');


class StockController {
  
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

  
  async getStockSummary(req, res, next) {
    const controllerStartTime = Date.now();
    console.log('[TIMING] Controller started');

    try {
      const serviceStartTime = Date.now();
      const authTime = serviceStartTime - (req._startTime || serviceStartTime);
      console.log(`[TIMING] Auth + Middleware overhead: ${authTime}ms`);

      const result = await stockService.getStockSummary();

      const serviceEndTime = Date.now();
      const serviceTime = serviceEndTime - serviceStartTime;
      console.log(`[TIMING] Service execution: ${serviceTime}ms`);

      const serializationStartTime = Date.now();
      res.json({
        success: true,
        data: result
      });

      const serializationTime = Date.now() - serializationStartTime;
      console.log(`[TIMING] Response serialization: ${serializationTime}ms`);
    } catch (error) {
      console.error('Error fetching stock summary:', error);
      next(error);
    }
  }
}

module.exports = new StockController();
