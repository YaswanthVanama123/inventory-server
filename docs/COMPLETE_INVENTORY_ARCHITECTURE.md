# Complete Inventory Sync Architecture

## Overview

This system integrates with two external portals to automatically manage inventory:

**MyCustomerConnect** → Orders (Purchases) → **ADD to Stock** (Incoming)
**RouteStar** → Invoices (Sales) → **SUBTRACT from Stock** (Outgoing)

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   INVENTORY MANAGEMENT                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐          ┌──────────────────────┐
│  MyCustomerConnect   │          │    RouteStar Portal  │
│  (Purchase Orders)   │          │    (Sales Invoices)  │
└──────────┬───────────┘          └──────────┬───────────┘
           │ Fetch Orders                    │ Fetch Invoices
           ▼                                 ▼
┌──────────────────────┐          ┌──────────────────────┐
│ CustomerConnectOrder │          │  RouteStarInvoice    │
│      Model (DB)      │          │     Model (DB)       │
└──────────┬───────────┘          └──────────┬───────────┘
           │ Process Stock                   │ Process Stock
           ▼                                 ▼
┌──────────────────────┐          ┌──────────────────────┐
│  StockMovement (IN)  │          │  StockMovement (OUT) │
│   +Add Quantity      │          │   -Reduce Quantity   │
└──────────┬───────────┘          └──────────┬───────────┘
           │                                 │
           └────────────┬────────────────────┘
                        ▼
              ┌──────────────────┐
              │    Inventory     │
              │  (Stock Levels)  │
              └──────────────────┘
```

## Architecture Components

### 1. MyCustomerConnect (Orders - ADD Stock)

#### Model: `CustomerConnectOrder`
- Unique constraint on `orderNumber`
- Tracks purchase orders from vendors
- Status: Complete, Processing, Shipped, etc.
- Line items with SKU, quantity, pricing

#### Service: `CustomerConnectSyncService`
**Methods:**
- `syncOrders(limit)` - Fetch and store orders
- `syncOrderDetails(orderNumber)` - Fetch line items for specific order
- `syncAllOrderDetails(limit)` - Batch fetch missing line items
- `processStockMovements()` - **ADD to inventory**
- `fullSync(options)` - Complete workflow

**Stock Processing:**
- Creates `StockMovement` with type: `IN`
- **Adds** quantity to existing inventory
- Creates new inventory items if SKU doesn't exist

#### API Routes: `/api/customerconnect/*`
```
POST /sync/orders          - Sync orders
POST /sync/details/:num    - Sync specific order details
POST /sync/all-details     - Batch sync missing details
POST /sync/stock           - Process stock (ADD)
POST /sync/full            - Complete sync
GET  /orders               - List orders
GET  /orders/:num          - Get specific order
GET  /stats                - Purchase analytics
```

### 2. RouteStar (Invoices - SUBTRACT Stock)

#### Model: `RouteStarInvoice`
- Unique constraint on `invoiceNumber`
- Tracks sales/invoices to customers
- Types: Pending, Closed
- Status: Pending, Completed, Closed, Cancelled
- Line items with quantities sold

#### Service: `RouteStarSyncService`
**Methods:**
- `syncPendingInvoices(limit)` - Fetch pending sales
- `syncClosedInvoices(limit)` - Fetch completed sales
- `syncInvoiceDetails(invoiceNumber)` - Fetch line items
- `processStockMovements()` - **SUBTRACT from inventory**
- `fullSync(options)` - Complete workflow

**Stock Processing:**
- Creates `StockMovement` with type: `OUT`
- **Subtracts** quantity from inventory
- Prevents negative stock (Math.max(0, ...))

#### API Routes: `/api/routestar/*`
```
POST /sync/pending         - Sync pending invoices
POST /sync/closed          - Sync closed invoices
POST /sync/details/:num    - Sync specific invoice details
POST /sync/stock           - Process stock (SUBTRACT)
POST /sync/full            - Complete sync
GET  /invoices             - List invoices
GET  /invoices/:num        - Get specific invoice
GET  /stats                - Sales analytics
```

### 3. Inventory Management

#### Model: `Inventory`
- SKU (unique identifier)
- Current quantity
- Last restock date and quantity
- Status (active, discontinued, etc.)

#### Model: `StockMovement`
- Audit trail of all stock changes
- Types: `IN` (purchase), `OUT` (sale), `ADJUST` (manual)
- Links back to source (order or invoice)
- Timestamp for historical tracking

## Complete Sync Workflow

### Step 1: Sync Orders (CustomerConnect)
```bash
# Fetches orders from MyCustomerConnect
POST /api/customerconnect/sync/orders
{
  "limit": 100
}
```

**Result:**
- Orders saved to `CustomerConnectOrder` collection
- Duplicates prevented via unique `orderNumber`
- Basic info: order number, date, vendor, total

### Step 2: Sync Order Details
```bash
# Fetches line items for orders without details
POST /api/customerconnect/sync/all-details
{
  "limit": 50
}
```

**Result:**
- Line items added to orders
- SKU, quantity, pricing extracted
- Ready for stock processing

### Step 3: Process Order Stock (ADD)
```bash
# Adds purchased items to inventory
POST /api/customerconnect/sync/stock
```

**Actions:**
- For each completed order's line items:
  - Create `StockMovement` (type: IN)
  - **Add** qty to `Inventory`
  - Mark order as `stockProcessed = true`

**Example:**
```javascript
// Order received: 100 units of SKU "CHEM-001"
StockMovement: { sku: "CHEM-001", type: "IN", qty: 100 }
Inventory: { sku: "CHEM-001", quantity: 500 → 600 }
```

### Step 4: Sync Invoices (RouteStar)
```bash
# Fetches pending invoices
POST /api/routestar/sync/pending
{ "limit": 100 }

# Fetches closed invoices
POST /api/routestar/sync/closed
{ "limit": 100 }
```

**Result:**
- Invoices saved to `RouteStarInvoice` collection
- Duplicates prevented via unique `invoiceNumber`
- Line items included (or fetched separately)

### Step 5: Process Invoice Stock (SUBTRACT)
```bash
# Reduces sold items from inventory
POST /api/routestar/sync/stock
```

**Actions:**
- For each completed invoice's line items:
  - Create `StockMovement` (type: OUT)
  - **Subtract** qty from `Inventory`
  - Mark invoice as `stockProcessed = true`

**Example:**
```javascript
// Sale: 25 units of SKU "CHEM-001"
StockMovement: { sku: "CHEM-001", type: "OUT", qty: 25 }
Inventory: { sku: "CHEM-001", quantity: 600 → 575 }
```

## Running Full Sync

### CustomerConnect Only
```bash
node test-customerconnect-sync.js
```

### RouteStar Only
```bash
node test-routestar-sync.js
```

### Complete Unified Sync
```bash
node test-complete-sync.js
```

This runs:
1. CustomerConnect orders sync
2. CustomerConnect order details sync
3. CustomerConnect stock processing (ADD)
4. RouteStar pending invoices sync
5. RouteStar closed invoices sync
6. RouteStar stock processing (SUBTRACT)
7. Final inventory reconciliation

## Database Queries

### Check Current Stock Level
```javascript
const item = await Inventory.findOne({ sku: 'CHEM-001' });
console.log(`Current stock: ${item.quantity}`);
```

### View Stock Movement History
```javascript
const movements = await StockMovement.find({ sku: 'CHEM-001' })
  .sort({ timestamp: -1 });

movements.forEach(m => {
  console.log(`${m.timestamp}: ${m.type} ${m.qty} (${m.notes})`);
});
```

### Find Unprocessed Orders
```javascript
const orders = await CustomerConnectOrder.getUnprocessedOrders();
console.log(`${orders.length} orders pending stock processing`);
```

### Find Unprocessed Invoices
```javascript
const invoices = await RouteStarInvoice.getUnprocessedInvoices();
console.log(`${invoices.length} invoices pending stock processing`);
```

### Purchase vs Sales Comparison
```javascript
const start = new Date('2024-01-01');
const end = new Date('2024-12-31');

const purchases = await CustomerConnectOrder.getPurchaseStats(start, end);
const sales = await RouteStarInvoice.getSalesStats(start, end);

console.log(`Purchased: $${purchases.totalPurchases}`);
console.log(`Sold: $${sales.totalSales}`);
console.log(`Margin: $${sales.totalSales - purchases.totalPurchases}`);
```

## Duplicate Prevention

Both systems use the same strategy:

**1. Unique Index**
```javascript
// CustomerConnect
{ orderNumber: 1 }, unique: true

// RouteStar
{ invoiceNumber: 1 }, unique: true
```

**2. Upsert Pattern**
```javascript
findOneAndUpdate(
  { orderNumber },  // or { invoiceNumber }
  { ...data },
  { upsert: true, new: true }
)
```

**3. Stock Processing Flag**
```javascript
{
  stockProcessed: false,  // Not yet processed
  stockProcessedAt: null,
  stockProcessingError: null
}
```

Once processed: `stockProcessed = true` prevents re-processing.

## Stock Processing Triggers

### CustomerConnect (ADD stock)
**Conditions** (ALL must be true):
- `stockProcessed === false`
- `status` in ['Complete', 'Processing', 'Shipped']
- Has line items (`items.length > 0`)

**Action:**
```javascript
StockMovement.create({
  sku: item.sku,
  type: 'IN',        // Incoming
  qty: item.qty,
  refType: 'PURCHASE_ORDER',
  refId: order._id
});

inventory.quantity += item.qty;  // ADD
```

### RouteStar (SUBTRACT stock)
**Conditions** (ALL must be true):
- `stockProcessed === false`
- `isComplete === true`
- `status` in ['Completed', 'Closed']
- Has line items (`lineItems.length > 0`)

**Action:**
```javascript
StockMovement.create({
  sku: item.sku,
  type: 'OUT',       // Outgoing
  qty: item.quantity,
  refType: 'INVOICE',
  refId: invoice._id
});

inventory.quantity -= item.quantity;  // SUBTRACT
inventory.quantity = Math.max(0, inventory.quantity);  // Prevent negative
```

## Analytics & Reporting

### Purchase Analytics (CustomerConnect)
```javascript
// Top vendors
const vendors = await CustomerConnectOrder.getTopVendors(start, end, 10);

// Top products purchased
const products = await CustomerConnectOrder.getTopProducts(start, end, 10);

// Purchase stats
const stats = await CustomerConnectOrder.getPurchaseStats(start, end);
```

### Sales Analytics (RouteStar)
```javascript
// Top customers
const customers = await RouteStarInvoice.getTopCustomers(start, end, 10);

// Sales stats
const stats = await RouteStarInvoice.getSalesStats(start, end);
```

### Inventory Analytics
```javascript
// Low stock items
const lowStock = await Inventory.find({ quantity: { $lt: 10 } });

// Stock movements summary
const summary = await StockMovement.getStockSummaryBySKU('CHEM-001');
```

## Error Handling

### Sync Errors
- Logged in `errors` array in response
- Individual failures don't stop entire sync
- `SyncLog` model tracks all operations

### Stock Processing Errors
- Stored in `stockProcessingError` field
- `stockProcessed` remains `false` for retry
- Manual review required for failed items

### Inventory Safety
- Negative stock prevented: `Math.max(0, quantity - sold)`
- Audit trail in `StockMovement` for disputes
- Reconciliation reports available

## Scheduling

### Recommended Schedule
```javascript
const cron = require('node-cron');

// Orders sync every 4 hours (purchases are less frequent)
cron.schedule('0 */4 * * *', async () => {
  await syncCustomerConnect();
});

// Invoices sync every 2 hours (sales are more frequent)
cron.schedule('0 */2 * * *', async () => {
  await syncRouteStar();
});

// Stock processing hourly
cron.schedule('0 * * * *', async () => {
  await processAllStockMovements();
});
```

## Best Practices

1. **Run orders sync before invoices** - Ensure stock is available before processing sales
2. **Monitor unprocessed counts** - Alert if backlog grows
3. **Regular reconciliation** - Compare portal totals vs database
4. **Backup before bulk operations** - Especially first full sync
5. **Test with small limits first** - Verify everything works before full sync
6. **SKU mapping** - Ensure SKUs match between systems
7. **Review failed items** - Manually resolve stock processing errors

## Configuration

Environment variables needed:
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/inventory_db

# CustomerConnect
CUSTOMERCONNECT_BASE_URL=https://envirostore.mycustomerconnect.com
CUSTOMERCONNECT_USERNAME=your_username
CUSTOMERCONNECT_PASSWORD=your_password

# RouteStar
ROUTESTAR_BASE_URL=https://emnrv.routestar.online
ROUTESTAR_USERNAME=your_username
ROUTESTAR_PASSWORD=your_password

# Browser
HEADLESS=true
```

## Monitoring Dashboard Queries

### System Health
```javascript
// Unprocessed items count
const unprocessedOrders = await CustomerConnectOrder.countDocuments({
  stockProcessed: false,
  status: { $in: ['Complete', 'Processing'] }
});

const unprocessedInvoices = await RouteStarInvoice.countDocuments({
  stockProcessed: false,
  isComplete: true
});

// Recent sync logs
const recentSyncs = await SyncLog.find()
  .sort({ startTime: -1 })
  .limit(10);

// Low stock alerts
const lowStock = await Inventory.find({ quantity: { $lt: 10 } });
```

## Troubleshooting

### Orders not adding stock
```javascript
// Check order status
const order = await CustomerConnectOrder.findByOrderNumber('75938');
console.log({
  stockProcessed: order.stockProcessed,
  status: order.status,
  itemsCount: order.items?.length
});

// Manually reprocess
order.stockProcessed = false;
await order.save();
// Then run stock processing again
```

### Invoices not reducing stock
```javascript
// Check invoice status
const invoice = await RouteStarInvoice.findByInvoiceNumber('NRV7339');
console.log({
  stockProcessed: invoice.stockProcessed,
  isComplete: invoice.isComplete,
  status: invoice.status,
  lineItemsCount: invoice.lineItems?.length
});
```

### Inventory mismatch
```javascript
// Recalculate from movements
const summary = await StockMovement.getStockSummaryBySKU('CHEM-001');
console.log(`Expected: ${summary.currentStock}`);

const actual = await Inventory.findOne({ sku: 'CHEM-001' });
console.log(`Actual: ${actual.quantity}`);

// If mismatch, create adjustment
await StockMovement.create({
  sku: 'CHEM-001',
  type: 'ADJUST',
  qty: summary.currentStock - actual.quantity,
  refType: 'ADJUSTMENT',
  notes: 'Reconciliation adjustment'
});
```

## Summary

This architecture provides:
- ✅ Automated inventory management
- ✅ Duplicate prevention for orders and invoices
- ✅ Audit trail for all stock movements
- ✅ Purchase and sales analytics
- ✅ Error resilience and retry capability
- ✅ RESTful API for integration
- ✅ Comprehensive reporting
- ✅ Safe stock processing (no negative inventory)

**Data Flow:**
```
Orders (CustomerConnect) → ADD Stock → Inventory
Sales (RouteStar) → SUBTRACT Stock → Inventory
```

Both systems maintain complete audit trails and prevent duplicate processing.
