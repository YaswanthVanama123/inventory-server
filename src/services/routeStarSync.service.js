const RouteStarAutomation = require('../automation/routestar');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarItem = require('../models/RouteStarItem');
const StockMovement = require('../models/StockMovement');
const SyncLog = require('../models/SyncLog');
const routestarConfig = require('../automation/config/routestar.config');




function parseRouteStarDate(dateString) {
  if (!dateString) return null;

  
  const parts = dateString.trim().split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0]) - 1; 
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);

    const date = new Date(year, month, day);

    
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}




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







class RouteStarSyncService {
  constructor() {
    this.automation = null;
    this.syncLog = null;
  }

  


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

  


  async close() {
    if (this.automation) {
      await this.automation.close();
    }
  }

  



  async syncItems(limit = Infinity) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📦 Syncing RouteStar Items to Database ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);

    await this.createSyncLog('routestar_items');

    try {
      
      const items = await this.automation.fetchItemsList(limit);
      console.log(`✓ Fetched ${items.length} items from RouteStar`);

      if (items.length === 0) {
        console.log(`ℹ️  No items found - this is normal if there are no items in the system`);

        await this.updateSyncLog({
          total: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          success: true
        });

        return {
          total: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          items: []
        };
      }

      
      console.log(`\n💾 Saving ${items.length} items to database...`);

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const savedItems = [];

      for (let i = 0; i < items.length; i++) {
        const itemData = items[i];

        try {
          
          const existing = await RouteStarItem.findOne({
            itemName: itemData.itemName,
            itemParent: itemData.itemParent
          });

          if (existing) {
            
            Object.assign(existing, {
              ...itemData,
              lastSynced: new Date()
            });

            await existing.save();
            updated++;
            console.log(`  ✓ [${i + 1}/${items.length}] Updated: ${itemData.itemName}`);
            savedItems.push(existing);
          } else {
            
            const newItem = await RouteStarItem.create({
              ...itemData,
              syncSource: 'RouteStar',
              lastSynced: new Date()
            });

            created++;
            console.log(`  ✓ [${i + 1}/${items.length}] Created: ${itemData.itemName}`);
            savedItems.push(newItem);
          }
        } catch (error) {
          failed++;
          console.error(`  ✗ [${i + 1}/${items.length}] Failed to save item ${itemData.itemName}:`, error.message);
        }
      }

      console.log(`\n✅ Item sync complete:`);
      console.log(`   - Total fetched: ${items.length}`);
      console.log(`   - Created: ${created}`);
      console.log(`   - Updated: ${updated}`);
      console.log(`   - Skipped: ${skipped}`);
      console.log(`   - Failed: ${failed}`);

      await this.updateSyncLog({
        total: items.length,
        created,
        updated,
        skipped,
        failed,
        success: true
      });

      return {
        total: items.length,
        created,
        updated,
        skipped,
        failed,
        items: savedItems
      };

    } catch (error) {
      console.error('❌ Items sync error:', error);

      await this.updateSyncLog({
        error: error.message,
        success: false
      });

      throw error;
    }
  }

  


  async createSyncLog(source = 'routestar') {
    this.syncLog = await SyncLog.create({
      source,
      status: 'RUNNING',
      startedAt: new Date()
    });
    return this.syncLog;
  }

  


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



  async checkPendingInvoicesInRouteStar() {
    console.log('\n🔍 Checking pending invoices in RouteStar...');

    try {
      const invoices = await this.automation.fetchInvoicesList(10, 'new');
      console.log(`✓ Found ${invoices.length} pending invoices in RouteStar`);

      return {
        count: invoices.length,
        hasPendingInvoices: invoices.length > 0
      };
    } catch (error) {
      console.error('❌ Error checking RouteStar pending invoices:', error);
      throw error;
    }
  }


  async syncPendingInvoices(limit = Infinity, direction = 'new') {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📦 Syncing RouteStar Pending Invoices to Database ${fetchAll ? '(ALL)' : `(limit: ${limit})`} - Direction: ${direction}`);

    await this.createSyncLog();

    try {

      const invoices = await this.automation.fetchInvoicesList(limit, direction);
      console.log(`✓ Fetched ${invoices.length} pending invoices from RouteStar`);

      if (invoices.length === 0) {
        console.log(`ℹ️  No pending invoices found - this is normal if all work is complete and invoices have moved to closed`);
        await this.updateSyncLog({
          total: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          success: true
        });
        return { created: 0, updated: 0, skipped: 0, total: 0, errors: [] };
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let detailsFetched = 0;
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


          const wasCreated = !result.createdAt ||
                            (new Date() - result.createdAt < 1000);

          if (wasCreated) {
            created++;
            console.log(`  ✓ Created: ${invoice.invoiceNumber}`);
          } else {
            updated++;
            console.log(`  ↻ Updated: ${invoice.invoiceNumber}`);
          }

          // Check if invoice needs details and fetch them immediately
          const needsDetails = !result.lineItems || result.lineItems.length === 0;
          if (needsDetails) {
            try {
              console.log(`    → Fetching details for ${invoice.invoiceNumber}...`);
              await this.syncInvoiceDetails(invoice.invoiceNumber);
              detailsFetched++;
              console.log(`    ✓ Details fetched for ${invoice.invoiceNumber}`);

              // Rate limiting to avoid overwhelming the server
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (detailError) {
              console.error(`    ✗ Failed to fetch details for ${invoice.invoiceNumber}: ${detailError.message}`);
              // Don't fail the whole sync, just log the error
            }
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

      // Delete pending invoices that are no longer in RouteStar (only when fetching ALL)
      let deleted = 0;
      if (fetchAll) {
        console.log(`\n🗑️  Checking for pending invoices to delete...`);

        // Get all invoice numbers that were fetched
        const fetchedInvoiceNumbers = invoices.map(inv => inv.invoiceNumber);

        // Find all pending invoices in our DB that were NOT in the fetched list
        const invoicesToDelete = await RouteStarInvoice.find({
          invoiceType: 'pending',
          invoiceNumber: { $nin: fetchedInvoiceNumbers }
        }).lean();

        if (invoicesToDelete.length > 0) {
          console.log(`  Found ${invoicesToDelete.length} pending invoices no longer in RouteStar - deleting...`);

          // Delete them
          const deleteResult = await RouteStarInvoice.deleteMany({
            invoiceType: 'pending',
            invoiceNumber: { $nin: fetchedInvoiceNumbers }
          });

          deleted = deleteResult.deletedCount;

          // Log each deleted invoice
          invoicesToDelete.forEach(inv => {
            console.log(`  ✗ Deleted: ${inv.invoiceNumber} (no longer pending)`);
          });

          console.log(`  ✓ Deleted ${deleted} pending invoices that are no longer active`);
        } else {
          console.log(`  ℹ️  No pending invoices need to be deleted`);
        }
      } else {
        console.log(`  ℹ️  Skipping deletion check (not fetching all pending invoices)`);
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
      console.log(`  - Deleted: ${deleted}`);
      console.log(`  - Details Fetched: ${detailsFetched}`);
      console.log(`  - Skipped: ${skipped}`);
      console.log(`  - Total processed: ${invoices.length}`);

      return { created, updated, deleted, detailsFetched, skipped, total: invoices.length, errors };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    }
  }

  




  async syncClosedInvoices(limit = Infinity, direction = 'new') {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📦 Syncing RouteStar Closed Invoices to Database ${fetchAll ? '(ALL)' : `(limit: ${limit})`} - Direction: ${direction}`);

    await this.createSyncLog();

    try {

      const invoices = await this.automation.fetchClosedInvoicesList(limit, direction);
      console.log(`✓ Fetched ${invoices.length} closed invoices from RouteStar`);

      if (invoices.length === 0) {
        console.log(`⚠️  No closed invoices found - this may indicate an issue or there truly are no closed invoices`);
        await this.updateSyncLog({
          total: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          success: true
        });
        return { created: 0, updated: 0, skipped: 0, total: 0, errors: [] };
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let detailsFetched = 0;
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


          const wasCreated = !result.createdAt ||
                            (new Date() - result.createdAt < 1000);

          if (wasCreated) {
            created++;
            console.log(`  ✓ Created: ${invoice.invoiceNumber}`);
          } else {
            updated++;
            console.log(`  ↻ Updated: ${invoice.invoiceNumber}`);
          }

          // Check if invoice needs details and fetch them immediately
          const needsDetails = !result.lineItems || result.lineItems.length === 0;
          if (needsDetails) {
            try {
              console.log(`    → Fetching details for ${invoice.invoiceNumber}...`);
              await this.syncInvoiceDetails(invoice.invoiceNumber);
              detailsFetched++;
              console.log(`    ✓ Details fetched for ${invoice.invoiceNumber}`);

              // Rate limiting to avoid overwhelming the server
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (detailError) {
              console.error(`    ✗ Failed to fetch details for ${invoice.invoiceNumber}: ${detailError.message}`);
              // Don't fail the whole sync, just log the error
            }
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
      console.log(`  - Details Fetched: ${detailsFetched}`);
      console.log(`  - Skipped: ${skipped}`);
      console.log(`  - Total processed: ${invoices.length}`);

      return { created, updated, skipped, detailsFetched, total: invoices.length, errors };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    }
  }

  


  async syncInvoiceDetails(invoiceNumber) {
    try {

      const invoice = await RouteStarInvoice.findByInvoiceNumber(invoiceNumber);
      if (!invoice) {
        throw new Error(`Invoice ${invoiceNumber} not found in database`);
      }

      // If invoice doesn't have detailUrl, construct it from invoice number
      let detailUrl = invoice.detailUrl;
      if (!detailUrl) {
        // Construct the detail URL using the RouteStar URL pattern
        const baseUrl = routestarConfig.baseUrl;
        detailUrl = `${baseUrl}/web/invoicedetails/${invoiceNumber}`;
        console.log(`  ⚠️  No detailUrl in database, using constructed URL: ${detailUrl}`);
      }


      const details = await this.automation.fetchInvoiceDetails(detailUrl);

      
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

  



  async syncAllInvoiceDetails(limit = Infinity, invoiceType = null, forceAll = false) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    const typeText = invoiceType ? ` (${invoiceType})` : '';
    const forceText = forceAll ? ' (FORCE ALL)' : ' (MISSING ONLY)';
    console.log(`\n📥 Syncing invoice details${typeText}${forceText}${fetchAll ? ' (ALL)' : ` (limit: ${limit})`}...`);

    await this.createSyncLog();

    try {

      let queryFilter = {};

      // If not forcing all, only get invoices without details
      if (!forceAll) {
        queryFilter = {
          $or: [
            { lineItems: { $exists: false } },
            { lineItems: { $size: 0 } }
          ]
        };
      }

      // Filter by invoice type
      if (invoiceType) {
        queryFilter.status = invoiceType;
      }

      const query = RouteStarInvoice.find(queryFilter).sort({ invoiceDate: -1 });


      const invoicesToSync = fetchAll ? await query : await query.limit(limit);

      console.log(`   Found: ${invoicesToSync.length} invoices to sync details`);

      let synced = 0;
      let skipped = 0;
      const errors = [];

      for (const invoice of invoicesToSync) {
        try {
          // Note: We no longer skip invoices without detailUrl
          // The syncInvoiceDetails method will construct the URL if needed

          await this.syncInvoiceDetails(invoice.invoiceNumber);
          synced++;

          // Rate limiting
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
        total: invoicesToSync.length,
        created: synced,
        skipped,
        success: true
      });

      console.log(`   ✓ Details Synced: ${synced}${skipped > 0 ? `, ${skipped} skipped` : ''}\n`);

      return { synced, skipped, total: invoicesToSync.length, errors };
    } catch (error) {
      await this.updateSyncLog({
        error: error.message
      });
      throw error;
    }
  }

  



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

            console.log(`  ✓ Stock movement created for ${item.sku || item.name}: -${item.quantity}`);
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
