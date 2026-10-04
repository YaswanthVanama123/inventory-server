const mongoose = require('mongoose');

const PurchaseOrder = require('../models/PurchaseOrder');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const TruckCheckout = require('../models/TruckCheckout');
const OrderDiscrepancy = require('../models/OrderDiscrepancy');
const StockDiscrepancy = require('../models/StockDiscrepancy');
const TruckDiscrepancy = require('../models/TruckDiscrepancy');
const StockMovement = require('../models/StockMovement');
const StockSummary = require('../models/StockSummary');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const RouteStarItem = require('../models/RouteStarItem');
const RouteStarCustomer = require('../models/RouteStarCustomer');
const RouteStarCustomerActivity = require('../models/RouteStarCustomerActivity');
const RouteStarCustomerAttachment = require('../models/RouteStarCustomerAttachment');
const RouteStarCustomerBillingInfo = require('../models/RouteStarCustomerBillingInfo');
const RouteStarCustomerContact = require('../models/RouteStarCustomerContact');
const RouteStarCustomerEquipment = require('../models/RouteStarCustomerEquipment');
const RouteStarCustomerNote = require('../models/RouteStarCustomerNote');
const RouteStarCustomerPricing = require('../models/RouteStarCustomerPricing');
const RouteStarCustomerRoute = require('../models/RouteStarCustomerRoute');
const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const ModelCategory = require('../models/ModelCategory');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const ItemCaseQuantity = require('../models/ItemCaseQuantity');
const Vendor = require('../models/Vendor');
const ExternalInvoice = require('../models/ExternalInvoice');
const SyncLog = require('../models/SyncLog');
const SyncCheckpoint = require('../models/SyncCheckpoint');
const FetchHistory = require('../models/FetchHistory');
const AuditLog = require('../models/AuditLog');

const itemCaseQuantityService = require('./itemCaseQuantity.service');
const manualPurchaseOrderItemService = require('./manualPurchaseOrderItem.service');

class DataPurgeService {
  constructor() {
    this.types = this._buildTypes();
  }

  _buildTypes() {
    const list = [
      {
        key: 'manual-orders',
        label: 'Manual Orders',
        group: 'Orders',
        description: 'Purchase orders created by hand (source: manual).',
        model: PurchaseOrder,
        baseFilter: { source: 'manual' },
        labelField: 'orderNumber',
        auditResource: 'ORDER',
        cascade: (ids) => this._cascadeOrder(ids),
      },
      {
        key: 'customerconnect-orders',
        label: 'CustomerConnect Orders',
        group: 'Orders',
        description: 'Orders synced from CustomerConnect. These return on the next sync.',
        model: CustomerConnectOrder,
        labelField: 'orderNumber',
        auditResource: 'ORDER',
        cascade: (ids) => this._cascadeOrder(ids),
      },
      {
        key: 'truck-checkouts',
        label: 'Truck Checkouts',
        group: 'Operations',
        description: 'Employee truck checkouts, their tally results and linked discrepancies.',
        model: TruckCheckout,
        labelField: 'employeeName',
        auditResource: 'TRUCK_CHECKOUT',
        cascade: (ids, docs) => this._cascadeCheckout(ids, docs),
        extraSelect: 'discrepancyId',
      },
      {
        key: 'order-discrepancies',
        label: 'Order Discrepancies',
        group: 'Operations',
        description: 'Receiving discrepancies raised when verifying a purchase order.',
        model: OrderDiscrepancy,
        labelField: 'orderNumber',
        auditResource: 'DISCREPANCY',
        cascade: (ids) => this._cascadeStockMovements(ids),
      },
      {
        key: 'stock-discrepancies',
        label: 'Stock Discrepancies',
        group: 'Operations',
        description: 'Stock-count discrepancies raised during truck checkout.',
        model: StockDiscrepancy,
        labelField: 'itemName',
        auditResource: 'DISCREPANCY',
      },
      {
        key: 'truck-discrepancies',
        label: 'Truck Discrepancies',
        group: 'Operations',
        description: 'Truck inventory discrepancies.',
        model: TruckDiscrepancy,
        labelField: 'itemName',
        auditResource: 'DISCREPANCY',
      },
      {
        key: 'stock-movements',
        label: 'Stock Movements',
        group: 'Stock',
        description: 'Raw IN/OUT/ADJUST ledger rows. Purging rebuilds affected stock summaries.',
        model: StockMovement,
        labelField: 'sku',
        auditResource: 'STOCK',
        isStockLedger: true,
      },
      {
        key: 'stock-summaries',
        label: 'Stock Summaries',
        group: 'Stock',
        description: 'Cached per-SKU on-hand totals. Rebuilt automatically from movements.',
        model: StockSummary,
        labelField: 'sku',
        auditResource: 'STOCK',
      },
      {
        key: 'routestar-invoices',
        label: 'RouteStar Invoices',
        group: 'Synced Data',
        description: 'Invoices synced from RouteStar. These return on the next sync.',
        model: RouteStarInvoice,
        labelField: 'invoiceNumber',
        auditResource: 'ROUTESTAR_INVOICE',
      },
      {
        key: 'routestar-items',
        label: 'RouteStar Items',
        group: 'Synced Data',
        description: 'Item catalog synced from RouteStar. These return on the next sync.',
        model: RouteStarItem,
        labelField: 'itemName',
        auditResource: 'ROUTESTAR_ITEM',
      },
      {
        key: 'routestar-customers',
        label: 'RouteStar Customers',
        group: 'Synced Data',
        description: 'Customers plus their contacts, notes, equipment, pricing and routes.',
        model: RouteStarCustomer,
        labelField: 'customerName',
        auditResource: 'ROUTESTAR_INVOICE',
        cascade: (ids) => this._cascadeCustomer(ids),
      },
      {
        key: 'external-invoices',
        label: 'External Invoices',
        group: 'Synced Data',
        description: 'Imported external invoices.',
        model: ExternalInvoice,
        labelField: 'invoiceNumber',
        auditResource: 'INVOICE',
        cascade: (ids) => this._cascadeStockMovements(ids),
      },
      {
        key: 'manual-po-items',
        label: 'Manual PO Items',
        group: 'Master Data',
        description: 'The manual purchase-order item catalog, plus the RouteStar item mapping of each deleted item.',
        model: ManualPurchaseOrderItem,
        labelField: 'sku',
        auditResource: 'INVENTORY',
        cascade: async (ids, docs) => {
          const { removed } = await manualPurchaseOrderItemService.removeStockLinkage(docs.map(doc => doc.sku));
          return { modelCategoryMappings: removed };
        },
        onPurged: () => manualPurchaseOrderItemService.invalidateCache(),
      },
      {
        key: 'model-category-mappings',
        label: 'Model Category Mappings',
        group: 'Master Data',
        description: 'SKU to RouteStar category mappings. Stock folders depend on these.',
        model: ModelCategory,
        labelField: 'modelNumber',
        auditResource: 'MODEL_CATEGORY',
      },
      {
        key: 'item-alias-mappings',
        label: 'Item Alias Mappings',
        group: 'Master Data',
        description: 'Canonical item name to alias mappings.',
        model: RouteStarItemAlias,
        labelField: 'canonicalName',
        auditResource: 'ITEM_ALIAS',
      },
      {
        key: 'case-quantity-mappings',
        label: 'Case Quantity Mappings',
        group: 'Master Data',
        description: 'Units-per-case pack sizes. Purged SKUs fall back to 1 unit per case.',
        model: ItemCaseQuantity,
        labelField: 'sku',
        auditResource: 'INVENTORY',
        onPurged: () => itemCaseQuantityService.invalidateCache(),
      },
      {
        key: 'vendors',
        label: 'Vendors',
        group: 'Master Data',
        description: 'Vendor records.',
        model: Vendor,
        labelField: 'name',
        auditResource: 'INVENTORY',
      },
      {
        key: 'sync-logs',
        label: 'Sync Logs',
        group: 'System',
        description: 'History of scraper/sync runs.',
        model: SyncLog,
        labelField: 'source',
        auditResource: 'SETTINGS',
      },
      {
        key: 'sync-checkpoints',
        label: 'Sync Checkpoints',
        group: 'System',
        description: 'Resume points for streaming syncs. Clearing forces a full re-sync.',
        model: SyncCheckpoint,
        labelField: 'scraper',
        auditResource: 'SETTINGS',
      },
      {
        key: 'fetch-history',
        label: 'Fetch History',
        group: 'System',
        description: 'Record of data fetches.',
        model: FetchHistory,
        labelField: 'fetchType',
        auditResource: 'SETTINGS',
      },
      {
        key: 'activity-logs',
        label: 'Activity / Audit Logs',
        group: 'System',
        description: 'User activity trail. Purge entries are written after the delete.',
        model: AuditLog,
        labelField: 'action',
        auditResource: 'SETTINGS',
      },
    ];

    const byKey = new Map();
    list.forEach(type => byKey.set(type.key, type));
    return byKey;
  }

  getType(key) {
    const type = this.types.get(key);
    if (!type) {
      throw new Error(`Unknown data type: ${key}`);
    }
    return type;
  }

  async getTypeSummaries() {
    const entries = Array.from(this.types.values());
    const counts = await Promise.all(
      entries.map(async type => {
        try {
          return await type.model.countDocuments(type.baseFilter || {});
        } catch (error) {
          console.error(`[DataPurge] Failed to count ${type.key}:`, error.message);
          return 0;
        }
      })
    );
    return entries.map((type, index) => ({
      key: type.key,
      label: type.label,
      group: type.group,
      description: type.description,
      count: counts[index],
    }));
  }

  async _cascadeStockMovements(ids) {
    if (ids.length === 0) return {};
    const movements = await StockMovement.find({ refId: { $in: ids } })
      .select('sku')
      .lean();
    if (movements.length === 0) return {};

    const skus = [...new Set(movements.map(m => m.sku).filter(Boolean))];
    const result = await StockMovement.deleteMany({ refId: { $in: ids } });
    await this.recalculateSummariesForSkus(skus);
    return { stockMovements: result.deletedCount };
  }

  async _cascadeOrder(ids) {
    if (ids.length === 0) return {};
    const [movements, discrepancies] = await Promise.all([
      this._cascadeStockMovements(ids),
      OrderDiscrepancy.deleteMany({ orderId: { $in: ids } }),
    ]);
    return { ...movements, orderDiscrepancies: discrepancies.deletedCount };
  }

  async _cascadeCheckout(ids, docs) {
    if (ids.length === 0) return {};
    const discrepancyIds = (docs || [])
      .map(doc => doc.discrepancyId)
      .filter(Boolean);
    const [movements, truckDiscrepancies, stockDiscrepancies] = await Promise.all([
      this._cascadeStockMovements(ids),
      TruckDiscrepancy.deleteMany({ checkoutId: { $in: ids } }),
      discrepancyIds.length > 0
        ? StockDiscrepancy.deleteMany({ _id: { $in: discrepancyIds } })
        : Promise.resolve({ deletedCount: 0 }),
    ]);
    return {
      ...movements,
      truckDiscrepancies: truckDiscrepancies.deletedCount,
      stockDiscrepancies: stockDiscrepancies.deletedCount,
    };
  }

  async _cascadeCustomer(ids) {
    if (ids.length === 0) return {};
    const children = [
      ['customerActivities', RouteStarCustomerActivity],
      ['customerAttachments', RouteStarCustomerAttachment],
      ['customerBillingInfo', RouteStarCustomerBillingInfo],
      ['customerContacts', RouteStarCustomerContact],
      ['customerEquipment', RouteStarCustomerEquipment],
      ['customerNotes', RouteStarCustomerNote],
      ['customerPricing', RouteStarCustomerPricing],
      ['customerRoutes', RouteStarCustomerRoute],
    ];
    const results = await Promise.all(
      children.map(([, Model]) => Model.deleteMany({ customerId: { $in: ids } }))
    );
    const tally = {};
    children.forEach(([name], index) => {
      if (results[index].deletedCount > 0) {
        tally[name] = results[index].deletedCount;
      }
    });
    return tally;
  }

  async recalculateSummariesForSkus(skus) {
    if (!skus || skus.length === 0) return 0;
    let updated = 0;
    for (const sku of skus) {
      try {
        const summary = await StockMovement.getStockSummaryBySKU(sku);
        const result = await StockSummary.updateOne(
          { sku: sku.toUpperCase() },
          {
            $set: {
              availableQty: Math.max(0, summary.currentStock),
              totalInQty: summary.totalIn,
              totalOutQty: summary.totalOut,
              lastMovement: new Date(),
            },
          }
        );
        if (result.matchedCount > 0) updated++;
      } catch (error) {
        console.error(`[DataPurge] Failed to rebuild summary for ${sku}:`, error.message);
      }
    }
    return updated;
  }

  async purgeByIds(typeKey, ids, user) {
    const type = this.getType(typeKey);
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('No records selected');
    }
    const validIds = ids
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
    if (validIds.length === 0) {
      throw new Error('No valid record ids supplied');
    }

    const filter = { ...(type.baseFilter || {}), _id: { $in: validIds } };
    return this._runPurge(type, filter, user, 'selected');
  }

  async purgeAll(typeKey, user) {
    const type = this.getType(typeKey);
    return this._runPurge(type, { ...(type.baseFilter || {}) }, user, 'all');
  }

  async _runPurge(type, filter, user, mode) {
    const selectFields = ['_id', type.labelField, type.extraSelect]
      .filter(Boolean)
      .join(' ');
    const docs = await type.model.find(filter).select(selectFields).lean();

    if (docs.length === 0) {
      return { type: type.key, deleted: 0, cascaded: {}, mode };
    }

    const ids = docs.map(doc => doc._id);

    let affectedSkus = [];
    if (type.isStockLedger) {
      affectedSkus = [...new Set(docs.map(doc => doc.sku).filter(Boolean))];
    }

    const cascaded = type.cascade ? await type.cascade(ids, docs) : {};

    const result = await type.model.deleteMany({ _id: { $in: ids } });

    if (affectedSkus.length > 0) {
      await this.recalculateSummariesForSkus(affectedSkus);
    }

    if (typeof type.onPurged === 'function') {
      await type.onPurged();
    }

    await this._writeAuditLog(type, result.deletedCount, cascaded, user, mode, docs);

    console.log(
      `[DataPurge] ${user?.username || user?.id || 'unknown'} purged ${result.deletedCount} ${type.key} (${mode})`,
      cascaded
    );

    return {
      type: type.key,
      label: type.label,
      deleted: result.deletedCount,
      cascaded,
      mode,
    };
  }

  async _writeAuditLog(type, deletedCount, cascaded, user, mode, docs) {
    try {
      const sample = docs
        .slice(0, 10)
        .map(doc => doc[type.labelField])
        .filter(Boolean);
      await AuditLog.create({
        action: 'DELETE',
        resource: type.auditResource || 'SETTINGS',
        resourceName: type.label,
        performedBy: user?._id || user?.id,
        performedByName: user?.fullName || user?.username,
        details: {
          purge: true,
          dataType: type.key,
          mode,
          deletedCount,
          cascaded,
          sample,
        },
      });
    } catch (error) {
      console.error('[DataPurge] Failed to write audit log:', error.message);
    }
  }
}

module.exports = new DataPurgeService();
