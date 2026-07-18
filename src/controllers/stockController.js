const stockCalculationService = require('../services/stockCalculation.service');
const stockService = require('../services/stock.service');
const stockSearchService = require('../services/stockSearch.service');


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
      // Full holistic summary (both tabs, all categories + global totals). The
      // service is unchanged so the other internal callers keep the full arrays.
      const result = await stockService.getStockSummary();
      const serviceEndTime = Date.now();
      const serviceTime = serviceEndTime - serviceStartTime;
      console.log(`[TIMING] Service execution: ${serviceTime}ms`);

      // ---- Backend pagination of the CATEGORY LIST ----
      // Query params: page (default 1), limit (default 20), search (optional),
      // tab (use|sell, default use). The global summary tiles stay computed over
      // the FULL category set; only the returned category slice is paginated.
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
      const tab = req.query.tab === 'sell' ? 'sell' : 'use';
      const search = (req.query.search || '').toString().trim();

      const tabData = tab === 'sell' ? result.sellStock : result.useStock;
      const allItems = (tabData && tabData.items) || [];
      const totals = (tabData && tabData.totals) || {};

      // Server-side search over the full category set. Mirrors the client's
      // category-level match (categoryName + aliases substring) and augments it
      // with the cross-collection fuzzy matcher (typos, SKUs & order item names).
      let filteredItems = allItems;
      if (search.length >= 1) {
        const q = search.toLowerCase();
        let fuzzySet = null;
        if (search.length >= 2) {
          try {
            const fuzzy = await stockSearchService.searchStock(search);
            fuzzySet = new Set(
              (fuzzy.matches || []).map((m) => (m.categoryName || '').toLowerCase())
            );
          } catch (err) {
            console.error('[StockSummary] fuzzy search failed, falling back to substring:', err.message);
            fuzzySet = null;
          }
        }
        filteredItems = allItems.filter((item) => {
          const name = (item.categoryName || '').toLowerCase();
          if (name.includes(q)) return true;
          if (
            Array.isArray(item.aliases) &&
            item.aliases.some((a) => (a || '').toLowerCase().includes(q))
          ) {
            return true;
          }
          return !!fuzzySet && fuzzySet.has(name);
        });
      }

      const total = filteredItems.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      const categories = filteredItems.slice(start, start + limit);

      // Augment each tab's totals with the footer aggregates (item + invoice
      // counts across the FULL category set) so the client no longer needs the
      // full items array shipped — enabling true payload reduction.
      const augmentTotals = (tabDataObj) => {
        const items = (tabDataObj && tabDataObj.items) || [];
        const t = (tabDataObj && tabDataObj.totals) || {};
        return {
          ...t,
          totalItemCount: items.reduce((s, i) => s + (i.itemCount || 0), 0),
          totalInvoiceCount: items.reduce((s, i) => s + (i.invoiceCount || 0), 0),
        };
      };
      const useTotals = augmentTotals(result.useStock);
      const sellTotals = augmentTotals(result.sellStock);

      const serializationStartTime = Date.now();
      res.json({
        success: true,
        data: {
          // Tile + footer totals only (no full items array) — the paginated
          // category slice is returned separately below.
          useStock: { totals: useTotals },
          sellStock: { totals: sellTotals },
          // Paginated view for the active tab.
          summary: tab === 'sell' ? sellTotals : useTotals,
          categories,
          pagination: { total, page, limit, totalPages }
        }
      });
      const serializationTime = Date.now() - serializationStartTime;
      console.log(`[TIMING] Response serialization: ${serializationTime}ms`);
    } catch (error) {
      console.error('Error fetching stock summary:', error);
      next(error);
    }
  }

  // Fuzzy + partial search across category names, aliases (Enviromaster /
  // order item names), SKUs, manual-PO item names and inventory item names.
  async search(req, res, next) {
    try {
      const q = (req.query.q || '').toString().trim();
      if (q.length < 2) {
        return res.json({success: true, data: {query: q, total: 0, matches: []}});
      }
      const result = await stockSearchService.searchStock(q);
      res.json({success: true, data: result});
    } catch (error) {
      console.error('Error searching stock:', error);
      next(error);
    }
  }
}
module.exports = new StockController();
