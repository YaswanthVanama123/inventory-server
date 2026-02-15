const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const Product = require('../models/Product');
const PurchaseOrder = require('../models/PurchaseOrder');
const ExternalInvoice = require('../models/ExternalInvoice');





class StockProcessor {
  




  static async processPurchaseOrder(purchaseOrder, userId = null) {
    if (purchaseOrder.stockProcessed) {
      console.log(`Purchase order ${purchaseOrder.orderNumber} already processed`);
      return;
    }

    const movements = [];

    for (const item of purchaseOrder.items) {
      try {
        
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

        
        await this.updateStockSummary(item.sku, item.qty, 'IN', userId);

        console.log(`Stock IN: ${item.sku} +${item.qty} from PO ${purchaseOrder.orderNumber}`);
      } catch (error) {
        console.error(`Error processing item ${item.sku}:`, error.message);
        throw error;
      }
    }

    
    purchaseOrder.stockProcessed = true;
    purchaseOrder.stockProcessedAt = new Date();
    await purchaseOrder.save();

    return movements;
  }

  




  static async processInvoice(invoice, userId = null) {
    if (invoice.stockProcessed) {
      console.log(`Invoice ${invoice.invoiceNumber} already processed`);
      return;
    }

    const movements = [];

    for (const item of invoice.items) {
      try {
        
        const stockSummary = await StockSummary.findOne({ sku: item.sku });

        if (!stockSummary || stockSummary.availableQty < item.qty) {
          console.warn(
            `Insufficient stock for ${item.sku}: available ${stockSummary?.availableQty || 0}, needed ${item.qty}`
          );
          
        }

        
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

        
        await this.updateStockSummary(item.sku, item.qty, 'OUT', userId);

        console.log(`Stock OUT: ${item.sku} -${item.qty} from Invoice ${invoice.invoiceNumber}`);
      } catch (error) {
        console.error(`Error processing item ${item.sku}:`, error.message);
        throw error;
      }
    }

    
    invoice.stockProcessed = true;
    invoice.stockProcessedAt = new Date();
    await invoice.save();

    return movements;
  }

  






  static async updateStockSummary(sku, qty, type, userId = null) {
    let stockSummary = await StockSummary.findOne({ sku });

    if (!stockSummary) {
      
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

    
    if (type === 'IN') {
      stockSummary.addStock(qty);
    } else if (type === 'OUT') {
      stockSummary.removeStock(qty);
    } else if (type === 'ADJUST') {
      stockSummary.availableQty += qty; 
      stockSummary.lastMovement = new Date();
    }

    stockSummary.lastUpdatedBy = userId;
    await stockSummary.save();

    return stockSummary;
  }

  




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

  







  static async createAdjustment(sku, qty, reason, userId = null) {
    
    const movement = await StockMovement.create({
      sku,
      type: 'ADJUST',
      qty,
      refType: 'ADJUSTMENT',
      refId: userId, 
      notes: reason,
      createdBy: userId
    });

    
    await this.updateStockSummary(sku, qty, 'ADJUST', userId);

    console.log(`Stock ADJUST: ${sku} ${qty > 0 ? '+' : ''}${qty} - ${reason}`);

    return movement;
  }

  





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

  




  static async getCurrentStock(sku) {
    const stockSummary = await StockSummary.findOne({ sku });
    return stockSummary ? stockSummary.availableQty : 0;
  }

  




  static async isLowStock(sku) {
    const stockSummary = await StockSummary.findOne({ sku }).populate('product');

    if (!stockSummary) return false;

    return stockSummary.isLowStock;
  }
}

module.exports = StockProcessor;
