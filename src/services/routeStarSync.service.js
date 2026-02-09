const RouteStarAutomation = require('../automation/routestar');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const StockMovement = require('../models/StockMovement');
const Inventory = require('../models/Inventory');
const SyncLog = require('../models/SyncLog');

/**
 * Parse date from MM/DD/YYYY format to Date object
 */
function parseRouteStarDate(dateString) {
  if (!dateString) return null;

  // Handle MM/DD/YYYY format
  const parts = dateString.trim().split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0]) - 1; // Month is 0-indexed
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);

    const date = new Date(year, month, day);

    // Validate the date
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  // Try standard Date parsing as fallback
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize status from RouteStar to match model enum
 */
function normalizeStatus(status) {
  if (!status) return 'Pending';

  const statusMap = {
    'complete': 'Completed',
    'completed': 'Completed',
    'pending': 'Pending',
    'closed': 'Closed',
    'cancelled': 'Cancelled'
  };

  const normalized = statusMap[status.toLowerCase()];
  return normalized || 'Pending';
}

/**
 * RouteStar Sync Service
 * Handles syncing invoices from RouteStar and processing stock movements
 */
class RouteStarSyncService {
  constructor() {
    this.automation = null;
    this.syncLog = null;
  }

  /**
   * Initialize the automation
   */
  async init() {
    console.log('Initializing RouteStarSyncService...');
    console.log('Creating new RouteStarAutomation instance...');
    this.automation = new RouteStarAutomation();

    console.log('Initializing automation (launching browser)...');
    await this.automation.init();

    console.log('Logging into RouteStar portal...');
    await this.automation.login();

    console.log('✓ RouteStarSyncService initialization complete');
    return this;
  }

  /**
   * Close the automation
   */
  async close() {
    if (this.automation) {
      await this.automation.close();
    }
  }

  /**
   * Create a sync log entry
   */
  async createSyncLog(source = 'routestar') {
    this.syncLog = await SyncLog.create({
      source,
      status: 'RUNNING',
      startedAt: new Date()
    });
    return this.syncLog;
  }

  /**
   * Update sync log
   */
  async updateSyncLog(updates) {
    if (this.syncLog) {
      if (updates.created !== undefined) {
        this.syncLog.recordsInserted = updates.created;
      }
      if (updates.updated !== undefined) {
        this.syncLog.recordsUpdated = updates.updated;
      }
      if (updates.skipped !== undefined || updates.failed !== undefined) {
        this.syncLog.recordsFailed = (updates.skipped || 0) + (updates.failed || 0);
      }
      if (updates.total !== undefined) {
        this.syncLog.recordsFound = updates.total;
      }
      if (updates.error !== undefined) {
        this.syncLog.errorMessage = updates.error;
        this.syncLog.status = 'FAILED';
        this.syncLog.endedAt = new Date();
      }
      if (updates.success === true) {
        this.syncLog.endedAt = new Date();
        this.syncLog.status = this.syncLog.recordsFailed > 0 ? 'PARTIAL' : 'SUCCESS';
      }
      await this.syncLog.save();
    }
  }

  /**
   * Sync pending invoices from RouteStar
   * @param {number} limit - Max invoices to fetch (default: Infinity = fetch all)
   * @param {string} direction - 'new' for newest first, 'old' for oldest first
   */
  async syncPendingInvoices(limit = Infinity, direction = 'new') {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📦 Syncing RouteStar Pending Invoices to Database ${fetchAll ? '(ALL)' : `(limit: ${limit})`} - Direction: ${direction}`);

    await this.createSyncLog();

    try {

      const invoices = await this.automation.fetchInvoicesList(limit, direction);
      console.log(`✓ Fetched ${invoices.length} pending invoices from RouteStar`);

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors = [];


      for (const invoice of invoices) {
        try {
          const invoiceData = {
            invoiceNumber: invoice.invoiceNumber,
            invoiceType: 'pending',
            status: normalizeStatus(invoice.status),
            invoiceDate: parseRouteStarDate(invoice.invoiceDate) || new Date(),
            customer: {
              name: invoice.customerName || 'Unknown',
              link: invoice.customerLink
            },
            enteredBy: invoice.enteredBy,
            assignedTo: invoice.assignedTo,
            stop: invoice.stop ? parseInt(invoice.stop) : 0,
            serviceNotes: invoice.serviceNotes,
            isComplete: invoice.isComplete || false,
            isPosted: invoice.isPosted || false,
            total: parseFloat(invoice.total) || 0,
            payment: invoice.payment,
            lastModified: parseRouteStarDate(invoice.lastModified),
            arrivalTime: invoice.arrivalTime,
            detailUrl: invoice.detailUrl,
            lastSyncedAt: new Date(),
            syncSource: 'pending',
            rawData: invoice
          };

          // Use findOneAndUpdate with upsert to prevent race conditions
          const result = await RouteStarInvoice.findOneAndUpdate(
            { invoiceNumber: invoice.invoiceNumber },
            invoiceData,
            {
              upsert: true,
              new: true,
              runValidators: true,
              setDefaultsOnInsert: true
            }
          );

          // Check if it was created or updated by checking if it existed before
          const wasCreated = !result.createdAt ||
                            (new Date() - result.createdAt < 1000);

          if (wasCreated) {
            created++;
            console.log(`  ✓ Created: ${invoice.invoiceNumber}`);
          } else {
            updated++;
            console.log(`  ↻ Updated: ${invoice.invoiceNumber}`);
          }
        } catch (error) {
          errors.push({
            invoiceNumber: invoice.invoiceNumber,
            error: error.message
          });
          skipped++;
          console.error(`  ✗ Error processing ${invoice.invoiceNumber}: ${error.message}`);
        }
      }

      await this.updateSyncLog({
        total: invoices.length,
        created,
        updated,
        skipped,
        success: true
      });

      console.log(`\n✓ Pending invoices sync completed:`);
      console.log(`  - Created: ${created}`);
      console.log(`  - Updated: ${updated}`);
      console.log(`  - Skipped: ${skipped}`);
      console.log(`  - Total processed: ${invoices.length}`);

      return { created, updated, skipped, total: invoices.length, errors };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Sync closed invoices from RouteStar
   * @param {number} limit - Max invoices to fetch (default: Infinity = fetch all)
   * @param {string} direction - 'new' for newest first, 'old' for oldest first
   */
  async syncClosedInvoices(limit = Infinity, direction = 'new') {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📦 Syncing RouteStar Closed Invoices to Database ${fetchAll ? '(ALL)' : `(limit: ${limit})`} - Direction: ${direction}`);

    await this.createSyncLog();

    try {

      const invoices = await this.automation.fetchClosedInvoicesList(limit, direction);
      console.log(`✓ Fetched ${invoices.length} closed invoices from RouteStar`);

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors = [];


      for (const invoice of invoices) {
        try {
          const invoiceData = {
            invoiceNumber: invoice.invoiceNumber,
            invoiceType: 'closed',
            status: normalizeStatus(invoice.status) || 'Closed',
            invoiceDate: parseRouteStarDate(invoice.invoiceDate) || new Date(),
            dateCompleted: parseRouteStarDate(invoice.dateCompleted),
            customer: {
              name: invoice.customerName || 'Unknown',
              link: invoice.customerLink
            },
            enteredBy: invoice.enteredBy,
            assignedTo: invoice.assignedTo,
            serviceNotes: invoice.serviceNotes,
            isComplete: invoice.isComplete || false,
            subtotal: parseFloat(invoice.subtotal) || 0,
            total: parseFloat(invoice.total) || 0,
            lastModified: parseRouteStarDate(invoice.lastModified),
            arrivalTime: invoice.arrivalTime,
            departureTime: invoice.departureTime,
            elapsedTime: invoice.elapsedTime,
            detailUrl: invoice.detailUrl,
            lastSyncedAt: new Date(),
            syncSource: 'closed',
            rawData: invoice
          };

          // Use findOneAndUpdate with upsert to prevent race conditions
          const result = await RouteStarInvoice.findOneAndUpdate(
            { invoiceNumber: invoice.invoiceNumber },
            invoiceData,
            {
              upsert: true,
              new: true,
              runValidators: true,
              setDefaultsOnInsert: true
            }
          );

          // Check if it was created or updated by checking if it existed before
          const wasCreated = !result.createdAt ||
                            (new Date() - result.createdAt < 1000);

          if (wasCreated) {
            created++;
            console.log(`  ✓ Created: ${invoice.invoiceNumber}`);
          } else {
            updated++;
            console.log(`  ↻ Updated: ${invoice.invoiceNumber}`);
          }
        } catch (error) {
          errors.push({
            invoiceNumber: invoice.invoiceNumber,
            error: error.message
          });
          skipped++;
          console.error(`  ✗ Error processing ${invoice.invoiceNumber}: ${error.message}`);
        }
      }

      await this.updateSyncLog({
        total: invoices.length,
        created,
        updated,
        skipped,
        success: true
      });

      console.log(`\n✓ Closed invoices sync completed:`);
      console.log(`  - Created: ${created}`);
      console.log(`  - Updated: ${updated}`);
      console.log(`  - Skipped: ${skipped}`);
      console.log(`  - Total processed: ${invoices.length}`);

      return { created, updated, skipped, total: invoices.length, errors };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Fetch and store invoice line items
   */
  async syncInvoiceDetails(invoiceNumber) {
    try {
      
      const invoice = await RouteStarInvoice.findByInvoiceNumber(invoiceNumber);
      if (!invoice) {
        throw new Error(`Invoice ${invoiceNumber} not found in database`);
      }

      
      const details = await this.automation.fetchInvoiceDetails(invoice.detailUrl);

      
      invoice.lineItems = details.items.map(item => ({
        name: item.name,
        description: item.description,
        quantity: item.quantity || 0,
        rate: parseFloat(item.rate) || 0,
        amount: parseFloat(item.amount) || 0,
        class: item.class,
        warehouse: item.warehouse,
        taxCode: item.taxCode,
        location: item.location
      }));

      
      invoice.invoiceDetails = {
        signedBy: details.signedBy,
        invoiceMemo: details.invoiceMemo,
        serviceNotes: details.serviceNotes,
        salesTaxRate: details.salesTaxRate
      };

      invoice.subtotal = parseFloat(details.subtotal) || 0;
      invoice.tax = parseFloat(details.tax) || 0;
      invoice.total = parseFloat(details.total) || 0;

      await invoice.save();

      console.log(`✓ Invoice details saved for ${invoiceNumber}`);
      return invoice;
    } catch (error) {
      console.error(`✗ Error syncing invoice details: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync all invoice details for invoices without line items
   * @param {number} limit - Max invoices to process (default: Infinity = fetch all)
   */
  async syncAllInvoiceDetails(limit = Infinity) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Syncing missing invoice details${fetchAll ? ' (ALL)' : ` (limit: ${limit})`}...`);

    await this.createSyncLog();

    try {
      
      const query = RouteStarInvoice.find({
        $or: [
          { lineItems: { $exists: false } },
          { lineItems: { $size: 0 } }
        ]
      }).sort({ invoiceDate: -1 });

      
      const invoicesWithoutDetails = fetchAll ? await query : await query.limit(limit);

      console.log(`   Found: ${invoicesWithoutDetails.length} invoices needing details`);

      let synced = 0;
      let skipped = 0;
      const errors = [];

      for (const invoice of invoicesWithoutDetails) {
        try {
          if (!invoice.detailUrl) {
            skipped++;
            continue;
          }

          await this.syncInvoiceDetails(invoice.invoiceNumber);
          synced++;

          
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          errors.push({
            invoiceNumber: invoice.invoiceNumber,
            error: error.message
          });
          skipped++;
        }
      }

      await this.updateSyncLog({
        total: invoicesWithoutDetails.length,
        created: synced,
        skipped,
        success: true
      });

      console.log(`   ✓ Details Synced: ${synced}${skipped > 0 ? `, ${skipped} skipped` : ''}\n`);

      return { synced, skipped, total: invoicesWithoutDetails.length, errors };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process stock movements for completed invoices
   * Reduces stock for sold items
   */
  async processStockMovements() {
    console.log(`\n📦 Processing stock movements for completed invoices...`);

    await this.createSyncLog();

    try {
      
      const invoices = await RouteStarInvoice.getUnprocessedInvoices();
      console.log(`✓ Found ${invoices.length} unprocessed invoices`);

      let processed = 0;
      let skipped = 0;
      const errors = [];

      for (const invoice of invoices) {
        try {
          
          if (!invoice.lineItems || invoice.lineItems.length === 0) {
            console.log(`  ⊗ Skipped ${invoice.invoiceNumber}: No line items`);
            skipped++;
            continue;
          }

          
          for (const item of invoice.lineItems) {
            if (item.quantity <= 0) continue;

            
            await StockMovement.create({
              sku: item.sku || item.name.toUpperCase(), 
              type: 'OUT',
              qty: item.quantity,
              refType: 'INVOICE',
              refId: invoice._id,
              sourceRef: invoice.invoiceNumber,
              timestamp: invoice.invoiceDate || new Date(),
              notes: `Sale: ${invoice.customer.name} - ${invoice.invoiceNumber}`
            });

            
            if (item.sku) {
              const inventoryItem = await Inventory.findOne({ sku: item.sku });
              if (inventoryItem) {
                inventoryItem.quantity = Math.max(0, inventoryItem.quantity - item.quantity);
                await inventoryItem.save();
                console.log(`  ✓ Reduced stock for ${item.sku}: -${item.quantity}`);
              }
            }
          }

          
          await invoice.markStockProcessed();
          processed++;
          console.log(`  ✓ Processed: ${invoice.invoiceNumber} (${invoice.lineItems.length} items)`);
        } catch (error) {
          errors.push({
            invoiceNumber: invoice.invoiceNumber,
            error: error.message
          });
          await invoice.markStockProcessed(error);
          skipped++;
          console.error(`  ✗ Error processing ${invoice.invoiceNumber}: ${error.message}`);
        }
      }

      await this.updateSyncLog({
        total: invoices.length,
        created: processed,
        skipped,
        success: true
      });

      console.log(`\n✓ Stock movements completed:`);
      console.log(`  - Processed: ${processed}`);
      console.log(`  - Skipped: ${skipped}`);
      console.log(`  - Total: ${invoices.length}`);

      return { processed, skipped, total: invoices.length, errors };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Full sync: pending + closed invoices + invoice details + stock movements
   * @param {Object} options - Sync options
   * @param {number} options.pendingLimit - Max pending invoices to fetch (default: Infinity = fetch all)
   * @param {number} options.closedLimit - Max closed invoices to fetch (default: Infinity = fetch all)
   * @param {number} options.detailsLimit - Max invoice details to fetch (default: Infinity = fetch all)
   * @param {boolean} options.processStock - Whether to process stock movements
   */
  async fullSync(options = {}) {
    const {
      pendingLimit = Infinity,
      closedLimit = Infinity,
      detailsLimit = Infinity,
      processStock = true
    } = options;

    console.log('\n🔄 Starting full RouteStar sync...');
    console.log('===================================');

    const results = {
      pending: null,
      closed: null,
      details: null,
      stock: null
    };

    try {
      
      results.pending = await this.syncPendingInvoices(pendingLimit);

      
      results.closed = await this.syncClosedInvoices(closedLimit);

      
      results.details = await this.syncAllInvoiceDetails(detailsLimit);

      
      if (processStock) {
        results.stock = await this.processStockMovements();
      }

      console.log('\n✅ Full sync completed successfully!');
      console.log('===================================\n');

      return results;
    } catch (error) {
      console.error(`\n❌ Full sync failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = RouteStarSyncService;
