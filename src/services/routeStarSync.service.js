const RouteStarAutomation = require('../automation/routestar');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarItem = require('../models/RouteStarItem');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const RouteStarCustomer = require('../models/RouteStarCustomer');
const RouteStarCustomerContact = require('../models/RouteStarCustomerContact');
const RouteStarCustomerEquipment = require('../models/RouteStarCustomerEquipment');
const RouteStarCustomerRoute = require('../models/RouteStarCustomerRoute');
const RouteStarCustomerNote = require('../models/RouteStarCustomerNote');
const RouteStarCustomerActivity = require('../models/RouteStarCustomerActivity');
const RouteStarCustomerAttachment = require('../models/RouteStarCustomerAttachment');
const RouteStarCustomerPricing = require('../models/RouteStarCustomerPricing');
const RouteStarCustomerBillingInfo = require('../models/RouteStarCustomerBillingInfo');
const RouteStarCustomerParser = require('../automation/parsers/routestar-customer.parser');
const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
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

  async syncCustomers(limit = Infinity) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n👥 Syncing RouteStar Customers to Database ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);
    await this.createSyncLog('routestar_customers');
    try {
      const customers = await this.automation.fetchCustomersList(limit);
      console.log(`✓ Fetched ${customers.length} customers from RouteStar`);
      if (customers.length === 0) {
        console.log(`ℹ️  No customers found - this is normal if there are no customers in the system`);
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
          customers: []
        };
      }
      console.log(`\n💾 Saving ${customers.length} customers to database...`);
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const savedCustomers = [];
      for (let i = 0; i < customers.length; i++) {
        const rawCustomer = customers[i];
        try {
          const customerData = RouteStarCustomerParser.parseCustomerList(rawCustomer);

          if (!customerData.customerId) {
            console.log(`  ⊗ [${i + 1}/${customers.length}] Skipped: No customer ID`);
            skipped++;
            continue;
          }

          const existing = await RouteStarCustomer.findOne({
            customerId: customerData.customerId
          });

          if (existing) {
            Object.assign(existing, {
              ...customerData,
              lastSyncDate: new Date()
            });
            await existing.save();
            updated++;
            console.log(`  ✓ [${i + 1}/${customers.length}] Updated: ${customerData.customerName || customerData.customerId}`);
            savedCustomers.push(existing);
          } else {
            const newCustomer = await RouteStarCustomer.create({
              ...customerData,
              lastSyncDate: new Date()
            });
            created++;
            console.log(`  ✓ [${i + 1}/${customers.length}] Created: ${customerData.customerName || customerData.customerId}`);
            savedCustomers.push(newCustomer);
          }
        } catch (error) {
          failed++;
          console.error(`  ✗ [${i + 1}/${customers.length}] Failed to save customer ${rawCustomer.customerId}:`, error.message);
        }
      }
      console.log(`\n✅ Customer sync complete:`);
      console.log(`   - Total fetched: ${customers.length}`);
      console.log(`   - Created: ${created}`);
      console.log(`   - Updated: ${updated}`);
      console.log(`   - Skipped: ${skipped}`);
      console.log(`   - Failed: ${failed}`);
      await this.updateSyncLog({
        total: customers.length,
        created,
        updated,
        skipped,
        failed,
        success: true
      });
      return {
        total: customers.length,
        created,
        updated,
        skipped,
        failed,
        customers: savedCustomers
      };
    } catch (error) {
      console.error('❌ Customers sync error:', error);
      await this.updateSyncLog({
        error: error.message,
        success: false
      });
      throw error;
    }
  }

  async syncCustomerDetails(customerId) {
    try {
      console.log(`\n  📥 Fetching details for customer: ${customerId}`);

      const customer = await RouteStarCustomer.findOne({ customerId });
      if (!customer) {
        throw new Error(`Customer ${customerId} not found in database`);
      }

      // Fetch details from RouteStar
      const details = await this.automation.fetchCustomerDetails(customerId);

      // Parse customer details
      const customerData = RouteStarCustomerParser.parseCustomerDetails(customerId, details);

      console.log(`\n  💾 Saving customer details to database...`);
      let updatedFields = 0;
      let preservedFields = 0;

      // Only update fields that have actual values (not null/undefined)
      // This preserves data from the list sync
      Object.keys(customerData).forEach(key => {
        if (customerData[key] !== null && customerData[key] !== undefined && customerData[key] !== '') {
          customer[key] = customerData[key];
          updatedFields++;
        } else {
          preservedFields++;
        }
      });

      console.log(`    ✓ Updated ${updatedFields} field(s)`);
      console.log(`    ✓ Preserved ${preservedFields} existing field(s)`);

      customer.lastSyncDate = new Date();
      await customer.save();
      console.log(`    ✓ Updated customer details for ${customerId}`);

      // Parse and save additional contacts
      if (details.contacts && details.contacts.length > 0) {
        await RouteStarCustomerContact.deleteMany({ customerId }); // Clear old contacts
        const contacts = RouteStarCustomerParser.parseContacts(customerId, details.contacts);
        if (contacts.length > 0) {
          await RouteStarCustomerContact.insertMany(contacts);
          console.log(`    ✓ Saved ${contacts.length} contacts`);
        }
      }

      // Parse and save equipment
      if (details.equipment && details.equipment.length > 0) {
        await RouteStarCustomerEquipment.deleteMany({ customerId }); // Clear old equipment
        const equipment = RouteStarCustomerParser.parseEquipment(customerId, details.equipment);
        if (equipment.length > 0) {
          await RouteStarCustomerEquipment.insertMany(equipment);
          console.log(`    ✓ Saved ${equipment.length} equipment items`);
        }
      }

      // Parse and save routes
      if (details.routes && details.routes.length > 0) {
        await RouteStarCustomerRoute.deleteMany({ customerId }); // Clear old routes
        const routes = RouteStarCustomerParser.parseRoutes(customerId, details.routes);
        if (routes.length > 0) {
          await RouteStarCustomerRoute.insertMany(routes);
          console.log(`    ✓ Saved ${routes.length} routes`);
        }
      }

      // Parse and save notes
      if (details.notes && details.notes.length > 0) {
        await RouteStarCustomerNote.deleteMany({ customerId }); // Clear old notes
        const notes = RouteStarCustomerParser.parseNotes(customerId, details.notes);
        if (notes.length > 0) {
          await RouteStarCustomerNote.insertMany(notes);
          console.log(`    ✓ Saved ${notes.length} notes`);
        }
      }

      // Parse and save activities
      if (details.activities && details.activities.length > 0) {
        await RouteStarCustomerActivity.deleteMany({ customerId }); // Clear old activities
        const activities = RouteStarCustomerParser.parseActivities(customerId, details.activities);
        if (activities.length > 0) {
          await RouteStarCustomerActivity.insertMany(activities);
          console.log(`    ✓ Saved ${activities.length} activities`);
        }
      }

      // Parse and save attachments
      if (details.attachments && details.attachments.length > 0) {
        await RouteStarCustomerAttachment.deleteMany({ customerId }); // Clear old attachments
        const attachments = RouteStarCustomerParser.parseAttachments(customerId, details.attachments);
        if (attachments.length > 0) {
          await RouteStarCustomerAttachment.insertMany(attachments);
          console.log(`    ✓ Saved ${attachments.length} attachments`);
        }
      }

      // Parse and save pricing
      if (details.pricing && details.pricing.length > 0) {
        await RouteStarCustomerPricing.deleteMany({ customerId }); // Clear old pricing
        const pricing = RouteStarCustomerParser.parsePricing(customerId, details.pricing);
        if (pricing.length > 0) {
          await RouteStarCustomerPricing.insertMany(pricing);
          console.log(`    ✓ Saved ${pricing.length} pricing items`);
        }
      }

      // Parse and save billing info
      if (details.billingInfo) {
        await RouteStarCustomerBillingInfo.deleteMany({ customerId }); // Clear old billing info
        const billingInfo = RouteStarCustomerParser.parseBillingInfo(customerId, details.billingInfo);
        await RouteStarCustomerBillingInfo.create(billingInfo);
        console.log(`    ✓ Saved billing info`);
      }

      console.log(`  ✅ Successfully synced all details for customer: ${customerId}`);
      return customer;
    } catch (error) {
      console.error(`  ✗ Error syncing customer details for ${customerId}: ${error.message}`);
      throw error;
    }
  }

  async syncAllCustomerDetails(limit = Infinity, forceAll = false) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    const forceText = forceAll ? ' (FORCE ALL)' : ' (BASIC INFO ONLY)';
    console.log(`\n📥 Syncing customer details${forceText}${fetchAll ? ' (ALL)' : ` (limit: ${limit})`}...`);

    try {
      let queryFilter = {};
      if (!forceAll) {
        // Only sync customers that don't have detailed info yet (basic fields are null)
        queryFilter = {
          $or: [
            { billingAddress1: null },
            { serviceAddress2: null },
            { latitude: null }
          ]
        };
      }

      const query = RouteStarCustomer.find(queryFilter).sort({ lastSyncDate: 1 });
      const customersToSync = fetchAll ? await query : await query.limit(limit);

      console.log(`   Found: ${customersToSync.length} customers to sync details`);

      let synced = 0;
      let skipped = 0;
      const errors = [];

      for (const customer of customersToSync) {
        try {
          await this.syncCustomerDetails(customer.customerId);
          synced++;
          // Add delay to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          errors.push({
            customerId: customer.customerId,
            error: error.message
          });
          skipped++;
        }
      }

      console.log(`\n✅ Customer details sync completed:`);
      console.log(`   - Details Synced: ${synced}`);
      console.log(`   - Skipped: ${skipped}`);
      console.log(`   - Total: ${customersToSync.length}`);

      return { synced, skipped, total: customersToSync.length, errors };
    } catch (error) {
      console.error('❌ Customer details sync error:', error);
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
          const needsDetails = !result.lineItems || result.lineItems.length === 0;
          if (needsDetails) {
            try {
              console.log(`    → Fetching details for ${invoice.invoiceNumber}...`);
              await this.syncInvoiceDetails(invoice.invoiceNumber);
              detailsFetched++;
              console.log(`    ✓ Details fetched for ${invoice.invoiceNumber}`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (detailError) {
              console.error(`    ✗ Failed to fetch details for ${invoice.invoiceNumber}: ${detailError.message}`);
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
      let deleted = 0;
      if (fetchAll) {
        console.log(`\n🗑️  Checking for pending invoices to delete...`);
        const fetchedInvoiceNumbers = invoices.map(inv => inv.invoiceNumber);
        const invoicesToDelete = await RouteStarInvoice.find({
          invoiceType: 'pending',
          invoiceNumber: { $nin: fetchedInvoiceNumbers }
        }).lean();
        if (invoicesToDelete.length > 0) {
          console.log(`  Found ${invoicesToDelete.length} pending invoices no longer in RouteStar - deleting...`);
          const deleteResult = await RouteStarInvoice.deleteMany({
            invoiceType: 'pending',
            invoiceNumber: { $nin: fetchedInvoiceNumbers }
          });
          deleted = deleteResult.deletedCount;
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
            customerGrouping: invoice.customerGrouping,
            postedBy: invoice.postedBy,
            postedTimestamp: parseRouteStarDate(invoice.postedTimestamp),
            paymentMethod: invoice.paymentMethod,
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
          const needsDetails = !result.lineItems || result.lineItems.length === 0;
          if (needsDetails) {
            try {
              console.log(`    → Fetching details for ${invoice.invoiceNumber}...`);
              await this.syncInvoiceDetails(invoice.invoiceNumber);
              detailsFetched++;
              console.log(`    ✓ Details fetched for ${invoice.invoiceNumber}`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (detailError) {
              console.error(`    ✗ Failed to fetch details for ${invoice.invoiceNumber}: ${detailError.message}`);
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
      let detailUrl = invoice.detailUrl;
      if (!detailUrl) {
        const baseUrl = routestarConfig.baseUrl;
        detailUrl = `${baseUrl}/web/invoicedetails/${invoiceNumber}`;
        console.log(`  ⚠️  No detailUrl in database, using constructed URL: ${detailUrl}`);
      }
      const details = await this.automation.fetchInvoiceDetails(detailUrl);
      const lineItemsWithSKU = await Promise.all(details.items.map(async (item) => {
        const canonicalName = await RouteStarItemAlias.getCanonicalName(item.name);
        const sku = (canonicalName || item.name).toUpperCase();
        return {
          name: item.name,
          description: item.description,
          quantity: item.quantity || 0,
          rate: parseFloat(item.rate) || 0,
          amount: parseFloat(item.amount) || 0,
          class: item.class,
          warehouse: item.warehouse,
          taxCode: item.taxCode,
          location: item.location,
          sku: sku
        };
      }));
      invoice.lineItems = lineItemsWithSKU;
      invoice.invoiceDetails = {
        signedBy: details.signedBy,
        invoiceMemo: details.invoiceMemo,
        serviceNotes: details.serviceNotes,
        salesTaxRate: details.salesTaxRate
      };
      invoice.subtotal = parseFloat(details.subtotal) || 0;
      invoice.tax = parseFloat(details.tax) || 0;
      invoice.total = parseFloat(details.total) || 0;

      // Update customer email and phone if available
      if (details.customerEmail) {
        invoice.customer.email = details.customerEmail;
      }
      if (details.customerPhone) {
        invoice.customer.phone = details.customerPhone;
      }

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
      if (!forceAll) {
        queryFilter = {
          $or: [
            { lineItems: { $exists: false } },
            { lineItems: { $size: 0 } }
          ]
        };
      }
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
      const Settings = require('../models/Settings');
      const settings = await Settings.getSettings();
      const cutoffDate = settings.stockCalculationCutoffDate;
      if (cutoffDate) {
        console.log(`📅 Stock Cutoff Date: ${cutoffDate.toISOString().split('T')[0]}`);
        console.log(`   - Invoices BEFORE: Stock will decrease (OLD)`);
        console.log(`   - Invoices AFTER: Stock will NOT decrease (NEW)`);
      } else {
        console.log(`⚠️  No cutoff date set - processing all invoices`);
      }
      const invoices = await RouteStarInvoice.getUnprocessedInvoices();
      console.log(`✓ Found ${invoices.length} unprocessed invoices`);
      let processed = 0;
      let skipped = 0;
      let skippedDueToCutoff = 0;
      let itemsProcessed = 0;
      const errors = [];
      for (const invoice of invoices) {
        try {
          const invoiceDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date();
          const shouldProcessStock = !cutoffDate || invoiceDate < cutoffDate;
          if (!shouldProcessStock) {
            await invoice.markStockProcessed();
            skippedDueToCutoff++;
            console.log(`  ⊙ ${invoice.invoiceNumber} (${invoiceDate.toISOString().split('T')[0]}) - After cutoff`);
            continue;
          }
          if (!invoice.lineItems || invoice.lineItems.length === 0) {
            console.log(`  ⊗ Skipped ${invoice.invoiceNumber}: No line items`);
            skipped++;
            continue;
          }
          for (const item of invoice.lineItems) {
            if (item.quantity <= 0) continue;
            const itemName = item.name;
            const canonicalName = await RouteStarItemAlias.getCanonicalName(itemName);
            const sku = (item.sku || canonicalName || itemName).toUpperCase();
            console.log(`  → Processing item: ${itemName} → Canonical: ${canonicalName} → SKU: ${sku}`);
            await StockMovement.create({
              sku: sku,
              type: 'OUT',
              qty: item.quantity,
              refType: 'INVOICE',
              refId: invoice._id,
              sourceRef: invoice.invoiceNumber,
              timestamp: invoice.invoiceDate || new Date(),
              notes: `Sale: ${invoice.customer.name} - ${invoice.invoiceNumber}`
            });
            let stockSummary = await StockSummary.findOne({ sku });
            if (!stockSummary) {
              console.log(`  ⚠️  Creating new StockSummary for SKU: ${sku}`);
              stockSummary = await StockSummary.create({
                sku,
                availableQty: 0,
                reservedQty: 0,
                totalInQty: 0,
                totalOutQty: 0,
                lowStockThreshold: 10
              });
            }
            stockSummary.removeStock(item.quantity);
            await stockSummary.save();
            itemsProcessed++;
            console.log(`  ✓ Stock updated for ${sku}: -${item.quantity} (Available: ${stockSummary.availableQty}, Total Out: ${stockSummary.totalOutQty})`);
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
      console.log(`  - Invoices Processed (stock decreased): ${processed}`);
      console.log(`  - Invoices Skipped (after cutoff): ${skippedDueToCutoff}`);
      console.log(`  - Items Processed: ${itemsProcessed}`);
      console.log(`  - Skipped (errors): ${skipped}`);
      console.log(`  - Total: ${invoices.length}`);
      return { processed, skipped, skippedDueToCutoff, itemsProcessed, total: invoices.length, errors };
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
