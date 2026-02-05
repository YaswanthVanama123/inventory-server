const CustomerConnectAutomation = require('../../automation/customerconnect');
const PurchaseOrder = require('../../models/PurchaseOrder');
const SyncLog = require('../../models/SyncLog');
const SKUMapper = require('../skuMapper');
const StockProcessor = require('../stockProcessor');

/**
 * CustomerConnect Sync Service
 * Orchestrates the sync of purchase orders from CustomerConnect
 */
class SyncCustomerConnect {
  constructor(userId = null) {
    this.userId = userId;
    this.automation = null;
    this.syncLog = null;
  }

  /**
   * Run full sync
   * @param {Object} options - Sync options
   * @param {number} options.limit - Max orders to fetch
   * @param {boolean} options.processStock - Whether to process stock movements
   * @returns {Promise<Object>} - Sync results
   */
  async run(options = {}) {
    const { limit = 50, processStock = true } = options;

    
    this.syncLog = await SyncLog.create({
      source: 'customerconnect',
      startedAt: new Date(),
      status: 'RUNNING',
      triggeredBy: this.userId
    });

    try {
      console.log('Starting CustomerConnect sync...');

      
      this.automation = await new CustomerConnectAutomation().init();

      
      await this.automation.login();

      
      const ordersList = await this.automation.fetchOrdersList(limit);
      this.syncLog.recordsFound = ordersList.length;
      await this.syncLog.save();

      let inserted = 0;
      let updated = 0;
      let failed = 0;

      
      for (const orderSummary of ordersList) {
        try {
          
          if (!orderSummary.detailUrl) {
            console.warn(`No detail URL for order ${orderSummary.orderNumber}, skipping`);
            failed++;
            continue;
          }

          const orderDetails = await this.automation.fetchOrderDetails(orderSummary.detailUrl);

          
          const result = await this.savePurchaseOrder(orderDetails);

          if (result.isNew) {
            inserted++;
          } else {
            updated++;
          }
        } catch (error) {
          console.error(`Error processing order ${orderSummary.orderNumber}:`, error.message);
          failed++;
        }
      }

      
      if (processStock) {
        console.log('Processing stock movements...');
        const processedCount = await StockProcessor.processUnprocessedPurchaseOrders(this.userId);
        this.syncLog.details = {
          ...this.syncLog.details,
          stockMovementsProcessed: processedCount
        };
      }

      
      this.syncLog.recordsInserted = inserted;
      this.syncLog.recordsUpdated = updated;
      this.syncLog.recordsFailed = failed;
      this.syncLog.complete(true);
      await this.syncLog.save();

      console.log(`CustomerConnect sync completed: ${inserted} inserted, ${updated} updated, ${failed} failed`);

      return {
        success: true,
        recordsFound: ordersList.length,
        recordsInserted: inserted,
        recordsUpdated: updated,
        recordsFailed: failed,
        syncLogId: this.syncLog._id
      };
    } catch (error) {
      console.error('CustomerConnect sync failed:', error);

      
      if (this.automation && this.automation.page) {
        const screenshotPath = await this.automation.takeScreenshot('sync-error');
        this.syncLog.screenshotPath = screenshotPath;
      }

      
      this.syncLog.complete(false, error.message);
      this.syncLog.errorStack = error.stack;
      await this.syncLog.save();

      throw error;
    } finally {
      
      if (this.automation) {
        await this.automation.close();
      }
    }
  }

  /**
   * Save or update purchase order
   * @param {Object} orderDetails - Order details from automation
   * @returns {Promise<Object>} - { purchaseOrder, isNew }
   */
  async savePurchaseOrder(orderDetails) {
    
    let purchaseOrder = await PurchaseOrder.findBySourceOrderId('customerconnect', orderDetails.orderNumber);

    const isNew = !purchaseOrder;

    
    const mappedItems = await SKUMapper.mapItems(orderDetails.items, 'customerconnect');

    
    const items = mappedItems.map(mapped => ({
      sku: mapped.sku,
      name: mapped.externalName || mapped.product?.name || 'Unknown',
      qty: orderDetails.items.find(i => i.name === mapped.externalName || i.sku === mapped.externalSKU)?.qty || 0,
      unitPrice: orderDetails.items.find(i => i.name === mapped.externalName || i.sku === mapped.externalSKU)?.unitPrice || 0,
      lineTotal: orderDetails.items.find(i => i.name === mapped.externalName || i.sku === mapped.externalSKU)?.lineTotal || 0,
      rawText: mapped.externalName
    }));

    
    const orderDate = this.parseDate(orderDetails.orderDate);

    if (isNew) {
      
      purchaseOrder = await PurchaseOrder.create({
        source: 'customerconnect',
        sourceOrderId: orderDetails.orderNumber,
        orderNumber: orderDetails.orderNumber,
        status: this.normalizeStatus(orderDetails.status),
        orderDate,
        vendor: orderDetails.vendor,
        items,
        subtotal: orderDetails.subtotal,
        tax: orderDetails.tax,
        shipping: orderDetails.shipping,
        total: orderDetails.total,
        raw: orderDetails,
        lastSyncedAt: new Date(),
        createdBy: this.userId,
        lastUpdatedBy: this.userId
      });

      console.log(`Created new purchase order: ${orderDetails.orderNumber}`);
    } else {
      
      purchaseOrder.status = this.normalizeStatus(orderDetails.status);
      purchaseOrder.orderDate = orderDate;
      purchaseOrder.vendor = orderDetails.vendor;
      purchaseOrder.items = items;
      purchaseOrder.subtotal = orderDetails.subtotal;
      purchaseOrder.tax = orderDetails.tax;
      purchaseOrder.shipping = orderDetails.shipping;
      purchaseOrder.total = orderDetails.total;
      purchaseOrder.raw = orderDetails;
      purchaseOrder.lastSyncedAt = new Date();
      purchaseOrder.lastUpdatedBy = this.userId;

      await purchaseOrder.save();

      console.log(`Updated purchase order: ${orderDetails.orderNumber}`);
    }

    return { purchaseOrder, isNew };
  }

  /**
   * Normalize order status
   * @param {string} status - Status from portal
   * @returns {string} - Normalized status
   */
  normalizeStatus(status) {
    const statusLower = (status || '').toLowerCase();

    if (statusLower.includes('confirm') || statusLower.includes('approved')) {
      return 'confirmed';
    }
    if (statusLower.includes('receiv') || statusLower.includes('delivered')) {
      return 'received';
    }
    if (statusLower.includes('complet') || statusLower.includes('closed')) {
      return 'completed';
    }
    if (statusLower.includes('cancel')) {
      return 'cancelled';
    }

    return 'pending';
  }

  /**
   * Parse date string
   * @param {string} dateStr
   * @returns {Date}
   */
  parseDate(dateStr) {
    if (!dateStr) return new Date();

    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
}

module.exports = SyncCustomerConnect;
