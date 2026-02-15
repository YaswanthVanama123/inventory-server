const RouteStarAutomation = require('../../automation/routestar');
const ExternalInvoice = require('../../models/ExternalInvoice');
const SyncLog = require('../../models/SyncLog');
const SKUMapper = require('../skuMapper');
const StockProcessor = require('../stockProcessor');





class SyncRouteStar {
  constructor(userId = null) {
    this.userId = userId;
    this.automation = null;
    this.syncLog = null;
  }

  






  async run(options = {}) {
    const { limit = 50, processStock = true } = options;

    
    this.syncLog = await SyncLog.create({
      source: 'routestar',
      startedAt: new Date(),
      status: 'RUNNING',
      triggeredBy: this.userId
    });

    try {
      console.log('Starting RouteStar sync...');

      
      this.automation = await new RouteStarAutomation().init();

      
      await this.automation.login();

      
      const invoicesList = await this.automation.fetchInvoicesList(limit);
      this.syncLog.recordsFound = invoicesList.length;
      await this.syncLog.save();

      let inserted = 0;
      let updated = 0;
      let failed = 0;

      
      for (const invoiceSummary of invoicesList) {
        try {
          
          if (!invoiceSummary.detailUrl) {
            console.warn(`No detail URL for invoice ${invoiceSummary.invoiceNumber}, skipping`);
            failed++;
            continue;
          }

          const invoiceDetails = await this.automation.fetchInvoiceDetails(invoiceSummary.detailUrl);

          
          const result = await this.saveInvoice(invoiceDetails);

          if (result.isNew) {
            inserted++;
          } else {
            updated++;
          }
        } catch (error) {
          console.error(`Error processing invoice ${invoiceSummary.invoiceNumber}:`, error.message);
          failed++;
        }
      }

      
      if (processStock) {
        console.log('Processing stock movements...');
        const processedCount = await StockProcessor.processUnprocessedInvoices(this.userId);
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

      console.log(`RouteStar sync completed: ${inserted} inserted, ${updated} updated, ${failed} failed`);

      return {
        success: true,
        recordsFound: invoicesList.length,
        recordsInserted: inserted,
        recordsUpdated: updated,
        recordsFailed: failed,
        syncLogId: this.syncLog._id
      };
    } catch (error) {
      console.error('RouteStar sync failed:', error);

      
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

  




  async saveInvoice(invoiceDetails) {
    
    let invoice = await ExternalInvoice.findBySourceInvoiceId('routestar', invoiceDetails.invoiceNumber);

    const isNew = !invoice;

    
    const mappedItems = await SKUMapper.mapItems(invoiceDetails.items, 'routestar');

    
    const items = mappedItems.map(mapped => ({
      sku: mapped.sku,
      name: mapped.externalName || mapped.product?.name || 'Unknown',
      qty: invoiceDetails.items.find(i => i.name === mapped.externalName || i.sku === mapped.externalSKU)?.qty || 0,
      unitPrice: invoiceDetails.items.find(i => i.name === mapped.externalName || i.sku === mapped.externalSKU)?.unitPrice || 0,
      lineTotal: invoiceDetails.items.find(i => i.name === mapped.externalName || i.sku === mapped.externalSKU)?.lineTotal || 0,
      rawText: mapped.externalName
    }));

    
    const invoiceDate = this.parseDate(invoiceDetails.invoiceDate);

    if (isNew) {
      
      invoice = await ExternalInvoice.create({
        source: 'routestar',
        sourceInvoiceId: invoiceDetails.invoiceNumber,
        invoiceNumber: invoiceDetails.invoiceNumber,
        status: this.normalizeStatus(invoiceDetails.status),
        invoiceDate,
        customer: invoiceDetails.customer,
        items,
        subtotal: invoiceDetails.subtotal,
        tax: invoiceDetails.tax,
        discount: invoiceDetails.discount,
        total: invoiceDetails.total,
        raw: invoiceDetails,
        lastSyncedAt: new Date(),
        createdBy: this.userId,
        lastUpdatedBy: this.userId
      });

      console.log(`Created new invoice: ${invoiceDetails.invoiceNumber}`);
    } else {
      
      invoice.status = this.normalizeStatus(invoiceDetails.status);
      invoice.invoiceDate = invoiceDate;
      invoice.customer = invoiceDetails.customer;
      invoice.items = items;
      invoice.subtotal = invoiceDetails.subtotal;
      invoice.tax = invoiceDetails.tax;
      invoice.discount = invoiceDetails.discount;
      invoice.total = invoiceDetails.total;
      invoice.raw = invoiceDetails;
      invoice.lastSyncedAt = new Date();
      invoice.lastUpdatedBy = this.userId;

      await invoice.save();

      console.log(`Updated invoice: ${invoiceDetails.invoiceNumber}`);
    }

    return { invoice, isNew };
  }

  




  normalizeStatus(status) {
    const statusLower = (status || '').toLowerCase();

    if (statusLower.includes('paid')) {
      return 'paid';
    }
    if (statusLower.includes('deliver') || statusLower.includes('shipped')) {
      return 'delivered';
    }
    if (statusLower.includes('complet') || statusLower.includes('closed')) {
      return 'completed';
    }
    if (statusLower.includes('cancel')) {
      return 'cancelled';
    }
    if (statusLower.includes('draft')) {
      return 'draft';
    }

    return 'issued';
  }

  




  parseDate(dateStr) {
    if (!dateStr) return new Date();

    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
}

module.exports = SyncRouteStar;
