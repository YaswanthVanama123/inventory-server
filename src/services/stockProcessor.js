const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const Product = require('../models/Product');
const PurchaseOrder = require('../models/PurchaseOrder');
const ExternalInvoice = require('../models/ExternalInvoice');

/**
 * Stock Processor Service
 * Handles stock movements and summary updates
 */
class StockProcessor {
  /**
   * Process purchase order - creates IN movements
   * @param {PurchaseOrder} purchaseOrder
   * @param {Object} userId - User ID for tracking
   */
  static async processPurchaseOrder(purchaseOrder, userId = null) {
    if (purchaseOrder.stockProcessed) {
      console.log(`Purchase order ${purchaseOrder.orderNumber} already processed`);
      return;
    }

    const movements = [];

    for (const item of purchaseOrder.items) {
      try {
        // Create stock movement IN
        const movement = await StockMovement.create({
          sku: item.sku,
          type: 'IN',
          qty: item.qty,
          refType: 'PURCHASE_ORDER',
          refId: purchaseOrder._id,
          sourceRef: purchaseOrder.orderNumber,
          notes: `Purchase from ${purchaseOrder.vendor.name}`,
          createdBy: userId
        });

        movements.push(movement);

        // Update stock summary
        await this.updateStockSummary(item.sku, item.qty, 'IN', userId);

        console.log(`Stock IN: ${item.sku} +${item.qty} from PO ${purchaseOrder.orderNumber}`);
      } catch (error) {
        console.error(`Error processing item ${item.sku}:`, error.message);
        throw error;
      }
    }

    // Mark purchase order as processed
    purchaseOrder.stockProcessed = true;
    purchaseOrder.stockProcessedAt = new Date();
    await purchaseOrder.save();

    return movements;
  }

  /**
   * Process invoice - creates OUT movements
   * @param {ExternalInvoice} invoice
   * @param {Object} userId - User ID for tracking
   */
  static async processInvoice(invoice, userId = null) {
    if (invoice.stockProcessed) {
      console.log(`Invoice ${invoice.invoiceNumber} already processed`);
      return;
    }

    const movements = [];

    for (const item of invoice.items) {
      try {
        // Check if sufficient stock available
        const stockSummary = await StockSummary.findOne({ sku: item.sku });

        if (!stockSummary || stockSummary.availableQty < item.qty) {
          console.warn(
            `Insufficient stock for ${item.sku}: available ${stockSummary?.availableQty || 0}, needed ${item.qty}`
          );
          // Continue anyway but log the warning
        }

        // Create stock movement OUT
        const movement = await StockMovement.create({
          sku: item.sku,
          type: 'OUT',
          qty: item.qty,
          refType: 'INVOICE',
          refId: invoice._id,
          sourceRef: invoice.invoiceNumber,
          notes: `Sale to ${invoice.customer.name}`,
          createdBy: userId
        });

        movements.push(movement);

        // Update stock summary
        await this.updateStockSummary(item.sku, item.qty, 'OUT', userId);

        console.log(`Stock OUT: ${item.sku} -${item.qty} from Invoice ${invoice.invoiceNumber}`);
      } catch (error) {
        console.error(`Error processing item ${item.sku}:`, error.message);
        throw error;
      }
    }

    // Mark invoice as processed
    invoice.stockProcessed = true;
    invoice.stockProcessedAt = new Date();
    await invoice.save();

    return movements;
  }

  /**
   * Update stock summary for a SKU
   * @param {string} sku
   * @param {number} qty
   * @param {string} type - 'IN' or 'OUT' or 'ADJUST'
   * @param {Object} userId
   */
  static async updateStockSummary(sku, qty, type, userId = null) {
    let stockSummary = await StockSummary.findOne({ sku });

    if (!stockSummary) {
      // Create new stock summary
      const product = await Product.findOne({ sku });

      stockSummary = await StockSummary.create({
        sku,
        product: product?._id,
        availableQty: 0,
        reservedQty: 0,
        totalInQty: 0,
        totalOutQty: 0,
        lowStockThreshold: 10,
        createdBy: userId,
        lastUpdatedBy: userId
      });
    }

    // Update quantities based on movement type
    if (type === 'IN') {
      stockSummary.addStock(qty);
    } else if (type === 'OUT') {
      stockSummary.removeStock(qty);
    } else if (type === 'ADJUST') {
      stockSummary.availableQty += qty; // qty can be positive or negative
      stockSummary.lastMovement = new Date();
    }

    stockSummary.lastUpdatedBy = userId;
    await stockSummary.save();

    return stockSummary;
  }

  /**
   * Process all unprocessed purchase orders
   * @param {Object} userId
   * @returns {Promise<number>} - Count of processed orders
   */
  static async processUnprocessedPurchaseOrders(userId = null) {
    const unprocessedOrders = await PurchaseOrder.getUnprocessedOrders();

    let processedCount = 0;

    for (const order of unprocessedOrders) {
      try {
        await this.processPurchaseOrder(order, userId);
        processedCount++;
      } catch (error) {
        console.error(`Error processing purchase order ${order.orderNumber}:`, error.message);
      }
    }

    console.log(`Processed ${processedCount} purchase orders`);
    return processedCount;
  }

  /**
   * Process all unprocessed invoices
   * @param {Object} userId
   * @returns {Promise<number>} - Count of processed invoices
   */
  static async processUnprocessedInvoices(userId = null) {
    const unprocessedInvoices = await ExternalInvoice.getUnprocessedInvoices();

    let processedCount = 0;

    for (const invoice of unprocessedInvoices) {
      try {
        await this.processInvoice(invoice, userId);
        processedCount++;
      } catch (error) {
        console.error(`Error processing invoice ${invoice.invoiceNumber}:`, error.message);
      }
    }

    console.log(`Processed ${processedCount} invoices`);
    return processedCount;
  }

  /**
   * Create manual stock adjustment
   * @param {string} sku
   * @param {number} qty - Positive to add, negative to remove
   * @param {string} reason
   * @param {Object} userId
   * @returns {Promise<StockMovement>}
   */
  static async createAdjustment(sku, qty, reason, userId = null) {
    // Create adjustment movement
    const movement = await StockMovement.create({
      sku,
      type: 'ADJUST',
      qty,
      refType: 'ADJUSTMENT',
      refId: userId, // Use userId as refId for manual adjustments
      notes: reason,
      createdBy: userId
    });

    // Update stock summary
    await this.updateStockSummary(sku, qty, 'ADJUST', userId);

    console.log(`Stock ADJUST: ${sku} ${qty > 0 ? '+' : ''}${qty} - ${reason}`);

    return movement;
  }

  /**
   * Recalculate stock summary from all movements
   * Useful for fixing inconsistencies
   * @param {string} sku
   * @returns {Promise<StockSummary>}
   */
  static async recalculateStockSummary(sku) {
    const summary = await StockMovement.getStockSummaryBySKU(sku);

    let stockSummary = await StockSummary.findOne({ sku });

    if (!stockSummary) {
      const product = await Product.findOne({ sku });
      stockSummary = new StockSummary({
        sku,
        product: product?._id
      });
    }

    stockSummary.availableQty = summary.currentStock;
    stockSummary.totalInQty = summary.totalIn;
    stockSummary.totalOutQty = summary.totalOut;
    stockSummary.lastMovement = new Date();

    await stockSummary.save();

    console.log(`Recalculated stock for ${sku}: ${summary.currentStock} units`);

    return stockSummary;
  }

  /**
   * Get current stock level for a SKU
   * @param {string} sku
   * @returns {Promise<number>}
   */
  static async getCurrentStock(sku) {
    const stockSummary = await StockSummary.findOne({ sku });
    return stockSummary ? stockSummary.availableQty : 0;
  }

  /**
   * Check if SKU is low on stock
   * @param {string} sku
   * @returns {Promise<boolean>}
   */
  static async isLowStock(sku) {
    const stockSummary = await StockSummary.findOne({ sku }).populate('product');

    if (!stockSummary) return false;

    return stockSummary.isLowStock;
  }
}

module.exports = StockProcessor;
