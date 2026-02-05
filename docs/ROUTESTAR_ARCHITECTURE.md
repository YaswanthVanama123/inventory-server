# RouteStar Integration - Architecture & Usage

## Overview

This integration fetches invoice data from RouteStar (sales) and automatically manages inventory by reducing stock for completed sales.

## Data Flow

```
┌─────────────────────┐
│  RouteStar Portal   │
│  (Sales Invoices)   │
└──────────┬──────────┘
           │ Fetch via Playwright
           ▼
┌─────────────────────┐
│  Sync Service       │
│  - Pending Invoices │
│  - Closed Invoices  │
└──────────┬──────────┘
           │ Save to MongoDB
           ▼
┌─────────────────────┐
│  RouteStarInvoice   │
│  Model (MongoDB)    │
└──────────┬──────────┘
           │ Process Stock
           ▼
┌─────────────────────┐
│  Stock Movement     │
│  (OUT - Reduce)     │
└──────────┬──────────┘
           │ Update
           ▼
┌─────────────────────┐
│  Inventory          │
│  (Stock Levels)     │
└─────────────────────┘
```

## Architecture Components

### 1. **Models**

#### `RouteStarInvoice` (`src/models/RouteStarInvoice.js`)
- Stores all invoice data from RouteStar
- Unique constraint on `invoiceNumber` prevents duplicates
- Tracks stock processing status
- Supports both pending and closed invoices

**Key Fields:**
- `invoiceNumber` - Unique identifier (e.g., "NRV7339")
- `invoiceType` - "pending" or "closed"
- `status` - "Pending", "Completed", "Closed", "Cancelled"
- `customer` - Customer name and details
- `lineItems` - Array of items sold
- `stockProcessed` - Boolean flag for inventory processing
- `total`, `subtotal`, `tax` - Financial totals

**Indexes:**
- Unique index on `invoiceNumber`
- Compound indexes for efficient queries on date, status, customer
- Index on `stockProcessed` for batch processing

### 2. **Services**

#### `RouteStarSyncService` (`src/services/routeStarSync.service.js`)
Handles all synchronization logic:

**Main Methods:**
- `syncPendingInvoices(limit)` - Fetch and store pending invoices
- `syncClosedInvoices(limit)` - Fetch and store closed invoices
- `syncInvoiceDetails(invoiceNumber)` - Fetch line items for specific invoice
- `processStockMovements()` - Create stock movements and reduce inventory
- `fullSync(options)` - Complete sync workflow

**Features:**
- Automatic duplicate prevention using upsert
- Error handling and logging via `SyncLog` model
- Transaction-safe stock processing
- Detailed progress console output

### 3. **Stock Processing**

When invoices are processed:

1. **Filter**: Only process completed/closed invoices with line items
2. **Create Movement**: For each line item, create `StockMovement` record:
   - Type: `OUT` (outgoing/sale)
   - Quantity: Item quantity sold
   - Reference: Links back to invoice
3. **Update Inventory**: Reduce stock levels for each SKU
4. **Mark Processed**: Set `stockProcessed = true` to prevent re-processing

### 4. **API Routes**

#### `POST /api/routestar/sync/full`
Run complete sync process

**Request:**
```json
{
  "pendingLimit": 100,
  "closedLimit": 100,
  "processStock": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Full sync completed successfully",
  "data": {
    "pending": {
      "created": 15,
      "updated": 35,
      "skipped": 0,
      "total": 50
    },
    "closed": {
      "created": 20,
      "updated": 30,
      "skipped": 0,
      "total": 50
    },
    "stock": {
      "processed": 25,
      "skipped": 0,
      "total": 25
    }
  }
}
```

#### `POST /api/routestar/sync/pending`
Sync pending invoices only

#### `POST /api/routestar/sync/closed`
Sync closed invoices only

#### `POST /api/routestar/sync/stock`
Process stock movements for unprocessed invoices

#### `GET /api/routestar/invoices`
Fetch invoices with filters

**Query Parameters:**
- `page`, `limit` - Pagination
- `invoiceType` - Filter by "pending" or "closed"
- `status` - Filter by status
- `customer` - Search by customer name
- `startDate`, `endDate` - Date range filter
- `stockProcessed` - Filter by processing status

#### `GET /api/routestar/invoices/:invoiceNumber`
Get specific invoice details

#### `GET /api/routestar/stats`
Get sales statistics

**Response:**
```json
{
  "success": true,
  "data": {
    "sales": {
      "totalSales": 15234.50,
      "totalInvoices": 125,
      "averageInvoiceValue": 121.88
    },
    "topCustomers": [
      {
        "_id": "Chick-fil-A #03582 Vienna",
        "totalSales": 2840.00,
        "invoiceCount": 3
      }
    ],
    "statusBreakdown": [...]
  }
}
```

## Usage

### Command Line Sync

Run the test script to perform a full sync:

```bash
node test-routestar-sync.js
```

This will:
1. Connect to MongoDB
2. Initialize RouteStar automation
3. Sync 50 pending invoices
4. Sync 50 closed invoices
5. Process stock movements
6. Display detailed statistics
7. Show database summary

### API Integration

```javascript
// Full sync via API
const response = await fetch('/api/routestar/sync/full', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    pendingLimit: 100,
    closedLimit: 100,
    processStock: true
  })
});

const result = await response.json();
console.log(result);
```

### Programmatic Usage

```javascript
const RouteStarSyncService = require('./src/services/routeStarSync.service');

async function syncInvoices() {
  const syncService = new RouteStarSyncService();

  try {
    await syncService.init();

    // Full sync
    const results = await syncService.fullSync({
      pendingLimit: 100,
      closedLimit: 100,
      processStock: true
    });

    console.log('Sync completed:', results);
  } finally {
    await syncService.close();
  }
}

syncInvoices();
```

## Database Queries

### Find unprocessed invoices
```javascript
const unprocessed = await RouteStarInvoice.getUnprocessedInvoices();
```

### Get sales statistics
```javascript
const startDate = new Date('2024-01-01');
const endDate = new Date('2024-12-31');
const stats = await RouteStarInvoice.getSalesStats(startDate, endDate);
```

### Get top customers
```javascript
const topCustomers = await RouteStarInvoice.getTopCustomers(startDate, endDate, 10);
```

### Find invoice by number
```javascript
const invoice = await RouteStarInvoice.findByInvoiceNumber('NRV7339');
```

## Duplicate Prevention

**Unique Constraint:** The `invoiceNumber` field has a unique index, ensuring no duplicates in the database.

**Upsert Strategy:** When syncing, the service uses `findOneAndUpdate` with `upsert: true`:
- If invoice exists: Updates existing record
- If invoice doesn't exist: Creates new record

This ensures idempotent sync operations - you can run sync multiple times safely.

## Stock Movement Logic

### When is stock processed?

An invoice triggers stock movement when ALL conditions are met:
1. `stockProcessed === false` (not yet processed)
2. `isComplete === true` (invoice is complete)
3. `status` is "Completed" or "Closed"
4. Has at least one line item

### Stock Movement Record

For each line item:
```javascript
{
  sku: "ITEM-001",
  type: "OUT",              // Outgoing (sale)
  qty: 5,                   // Quantity sold
  refType: "INVOICE",       // Reference type
  refId: ObjectId("..."),   // Invoice MongoDB ID
  sourceRef: "NRV7339",     // Invoice number
  timestamp: Date,          // Invoice date
  notes: "Sale: Customer Name - NRV7339"
}
```

### Inventory Update

```javascript
// Before sale
{ sku: "ITEM-001", quantity: 100 }

// After processing invoice with 5 units sold
{ sku: "ITEM-001", quantity: 95 }
```

## Error Handling

### Sync Errors
- Each invoice is processed independently
- Errors are logged in the `errors` array
- Failed invoices are skipped, sync continues
- `stockProcessingError` field stores error details

### Stock Processing Errors
- If stock processing fails, `stockProcessed` remains `false`
- Error message stored in `stockProcessingError`
- Invoice can be reprocessed later

### SyncLog Tracking
All sync operations are logged:
```javascript
{
  source: 'routestar',
  type: 'pending_invoices',
  status: 'completed',
  recordsProcessed: 50,
  recordsCreated: 15,
  recordsUpdated: 35,
  recordsSkipped: 0,
  errors: [],
  startTime: Date,
  endTime: Date
}
```

## Performance Optimization

### Indexes
- All query patterns are covered by indexes
- Compound indexes for multi-field queries
- Regular maintenance recommended: `db.routestarinvoices.reIndex()`

### Batch Processing
- Sync runs in batches (configurable limit)
- Stock movements processed in bulk
- Database writes are optimized

### Query Optimization
```javascript
// Efficient: Uses indexes
RouteStarInvoice.find({
  invoiceDate: { $gte: startDate },
  status: 'Completed'
}).sort({ invoiceDate: -1 });

// Inefficient: Avoid
RouteStarInvoice.find({
  'lineItems.name': /pattern/i  // No index on nested field
});
```

## Monitoring

### Check Sync Status
```javascript
const syncLogs = await SyncLog.find({ source: 'routestar' })
  .sort({ startTime: -1 })
  .limit(10);
```

### View Unprocessed Invoices
```javascript
const count = await RouteStarInvoice.countDocuments({
  stockProcessed: false,
  isComplete: true
});

console.log(`${count} invoices pending stock processing`);
```

### Inventory Audit
```javascript
const movements = await StockMovement.find({
  refType: 'INVOICE',
  timestamp: { $gte: startDate }
});
```

## Scheduling

### Cron Job Example
```javascript
const cron = require('node-cron');
const RouteStarSyncService = require('./src/services/routeStarSync.service');

// Run sync every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('Starting scheduled RouteStar sync...');

  const syncService = new RouteStarSyncService();
  try {
    await syncService.init();
    await syncService.fullSync();
  } finally {
    await syncService.close();
  }
});
```

## Troubleshooting

### Issue: Duplicate invoices
**Solution:** Check unique index exists
```javascript
db.routestarinvoices.getIndexes()
// Should see: { invoiceNumber: 1 }, unique: true
```

### Issue: Stock not processing
**Solution:** Check invoice status
```javascript
const invoice = await RouteStarInvoice.findByInvoiceNumber('NRV7339');
console.log({
  stockProcessed: invoice.stockProcessed,
  isComplete: invoice.isComplete,
  status: invoice.status,
  lineItemsCount: invoice.lineItems?.length
});
```

### Issue: Inventory mismatch
**Solution:** Verify stock movements
```javascript
const movements = await StockMovement.find({ sourceRef: 'NRV7339' });
console.log(movements);
```

## Testing

Run the comprehensive test:
```bash
node test-routestar-sync.js
```

Outputs:
- Sync progress for each step
- Statistics summary
- Database invoice summary
- Sales stats (last 30 days)
- Top customers

## Best Practices

1. **Run sync regularly** - Schedule every 4-6 hours
2. **Monitor sync logs** - Check for errors regularly
3. **Verify inventory** - Periodically audit stock levels
4. **Handle line items carefully** - Ensure SKU mapping is correct
5. **Test in development** - Always test sync with small limits first
6. **Backup before bulk operations** - Especially before first full sync

## Configuration

Environment variables needed in `.env`:
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/inventory_db

# RouteStar Credentials
ROUTESTAR_BASE_URL=https://emnrv.routestar.online
ROUTESTAR_USERNAME=your_username
ROUTESTAR_PASSWORD=your_password

# Browser settings
HEADLESS=true
```

## Future Enhancements

- [ ] Real-time webhook sync
- [ ] SKU auto-mapping from item names
- [ ] Invoice email notifications
- [ ] Advanced reporting dashboard
- [ ] Conflict resolution for concurrent updates
- [ ] Export to QuickBooks integration
