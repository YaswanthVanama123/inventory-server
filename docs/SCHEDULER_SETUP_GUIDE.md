# Automated Daily Inventory Sync - Setup Guide

## Overview

The automated inventory sync scheduler runs daily at 3:00 AM to:
1. **Sync CustomerConnect Orders** (Purchases - ADD to stock)
2. **Sync RouteStar Invoices** (Sales - SUBTRACT from stock)
3. **Process stock movements** automatically

## Quick Start

### 1. Enable Auto-Start

Add these variables to your `.env` file:

```env
# Enable automatic scheduler start
AUTO_START_SCHEDULER=true

# Schedule: 3:00 AM daily (default)
SYNC_CRON_EXPRESSION=0 3 * * *

# Limits
ORDERS_SYNC_LIMIT=100
INVOICES_SYNC_LIMIT=100

# Timezone
TZ=America/New_York
```

### 2. Start Your Server

```bash
npm start
```

The scheduler will automatically start and display:
```
✅ Inventory scheduler started - Daily sync at 3:00 AM
```

## Configuration Options

### Cron Expression Format

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of Week (0-7, 0 and 7 = Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of Month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

### Common Schedules

```env
# Daily at 3:00 AM (default)
SYNC_CRON_EXPRESSION=0 3 * * *

# Daily at midnight
SYNC_CRON_EXPRESSION=0 0 * * *

# Every 12 hours (12 AM and 12 PM)
SYNC_CRON_EXPRESSION=0 0,12 * * *

# Every 6 hours
SYNC_CRON_EXPRESSION=0 */6 * * *

# Every day at 2 AM and 2 PM
SYNC_CRON_EXPRESSION=0 2,14 * * *

# Every weekday at 6 AM
SYNC_CRON_EXPRESSION=0 6 * * 1-5

# Every Sunday at 1 AM
SYNC_CRON_EXPRESSION=0 1 * * 0
```

## API Endpoints

### Get Scheduler Status

```bash
GET /api/inventory-scheduler/status
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "syncInProgress": false,
    "lastRun": {
      "customerConnect": "2024-01-15T03:00:00.000Z",
      "routeStar": "2024-01-15T03:05:00.000Z",
      "combined": "2024-01-15T03:10:00.000Z"
    },
    "nextRun": "Check system logs for exact time"
  }
}
```

### Start Scheduler

```bash
POST /api/inventory-scheduler/start
Authorization: Bearer <token>
Content-Type: application/json

{
  "cronExpression": "0 3 * * *",
  "ordersLimit": 100,
  "invoicesLimit": 100,
  "processStock": true,
  "timezone": "America/New_York"
}
```

### Stop Scheduler

```bash
POST /api/inventory-scheduler/stop
Authorization: Bearer <token>
```

### Run Sync Now (Manual)

```bash
POST /api/inventory-scheduler/run-now
Authorization: Bearer <token>
Content-Type: application/json

{
  "ordersLimit": 50,
  "invoicesLimit": 50,
  "processStock": true
}
```

## What Happens During Sync

### Step 1: CustomerConnect Orders (3:00 AM)
```
1. Login to CustomerConnect portal
2. Fetch up to 100 orders
3. Sync order details for orders without line items
4. Process stock movements:
   - Create StockMovement records (type: IN)
   - ADD quantities to Inventory
5. Close browser
```

### Step 2: RouteStar Invoices (3:05 AM)
```
1. Login to RouteStar portal
2. Fetch pending invoices (up to 50)
3. Fetch closed invoices (up to 50)
4. Sync invoice details
5. Process stock movements:
   - Create StockMovement records (type: OUT)
   - SUBTRACT quantities from Inventory
6. Close browser
```

## Monitoring

### View Logs

Check server logs for sync progress:

```bash
# Live logs
tail -f logs/app.log

# Search for sync events
grep "Inventory Sync" logs/app.log

# View last sync
grep "SYNC SUMMARY" logs/app.log | tail -1
```

### Log Output Example

```
═══════════════════════════════════════════════════════
🔄 Starting Scheduled Inventory Sync - 1/15/2024, 3:00:00 AM
═══════════════════════════════════════════════════════

📥 Step 1: Syncing CustomerConnect Orders (Purchases - ADD stock)
─────────────────────────────────────────────────────
✓ Orders sync completed
  Orders: 15 created, 85 updated
  Details: 12 synced
  Stock: 15 orders processed

📥 Step 2: Syncing RouteStar Invoices (Sales - SUBTRACT stock)
─────────────────────────────────────────────────────
✓ RouteStar sync completed
  Pending: 8 created, 22 updated
  Closed: 5 created, 15 updated
  Stock: 13 invoices processed

═══════════════════════════════════════════════════════
📊 SYNC SUMMARY
═══════════════════════════════════════════════════════
CustomerConnect: ✓ Success
RouteStar:       ✓ Success
═══════════════════════════════════════════════════════

✅ Scheduled sync completed successfully
```

## Database Queries

### Check Last Sync Times

```javascript
// Get last CustomerConnect sync
const lastOrder = await CustomerConnectOrder.findOne()
  .sort({ lastSyncedAt: -1 })
  .select('orderNumber lastSyncedAt');

console.log('Last order sync:', lastOrder.lastSyncedAt);

// Get last RouteStar sync
const lastInvoice = await RouteStarInvoice.findOne()
  .sort({ lastSyncedAt: -1 })
  .select('invoiceNumber lastSyncedAt');

console.log('Last invoice sync:', lastInvoice.lastSyncedAt);
```

### View Sync Logs

```javascript
// Get recent sync logs
const syncLogs = await SyncLog.find()
  .sort({ startTime: -1 })
  .limit(10);

syncLogs.forEach(log => {
  console.log(`${log.source}: ${log.status} - ${log.recordsProcessed} records`);
});
```

### Check Unprocessed Items

```javascript
// Count unprocessed orders
const unprocessedOrders = await CustomerConnectOrder.countDocuments({
  stockProcessed: false,
  status: { $in: ['Complete', 'Processing', 'Shipped'] }
});

// Count unprocessed invoices
const unprocessedInvoices = await RouteStarInvoice.countDocuments({
  stockProcessed: false,
  isComplete: true
});

console.log(`Unprocessed: ${unprocessedOrders} orders, ${unprocessedInvoices} invoices`);
```

## Troubleshooting

### Scheduler Not Starting

**Check .env file:**
```env
AUTO_START_SCHEDULER=true  # Must be 'true', not 'false'
```

**Check server logs:**
```bash
grep "scheduler" logs/app.log
```

**Manually start via API:**
```bash
curl -X POST http://localhost:5001/api/inventory-scheduler/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cronExpression": "0 3 * * *"}'
```

### Sync Failing

**Check credentials:**
```env
CUSTOMERCONNECT_USERNAME=...
CUSTOMERCONNECT_PASSWORD=...
ROUTESTAR_USERNAME=...
ROUTESTAR_PASSWORD=...
```

**Check portal access:**
- Login manually to verify credentials work
- Check for captchas or authentication changes

**View error details:**
```javascript
// Find failed sync logs
const failedSyncs = await SyncLog.find({ status: 'failed' })
  .sort({ startTime: -1 })
  .limit(5);

failedSyncs.forEach(log => {
  console.log('Error:', log.error);
  console.log('Stack:', log.errorStack);
});
```

### Duplicate Records

**Prevention:**
- Unique indexes on `orderNumber` and `invoiceNumber` prevent duplicates
- Upsert pattern updates existing records instead of creating new ones

**If duplicates exist:**
```javascript
// Find duplicate orders
const duplicates = await CustomerConnectOrder.aggregate([
  { $group: { _id: '$orderNumber', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
]);

// Remove duplicates (keep most recent)
for (const dup of duplicates) {
  const records = await CustomerConnectOrder.find({ orderNumber: dup._id })
    .sort({ createdAt: -1 });

  // Keep first, delete rest
  for (let i = 1; i < records.length; i++) {
    await records[i].remove();
  }
}
```

### Stock Not Processing

**Check order/invoice status:**
```javascript
// Orders must be 'Complete', 'Processing', or 'Shipped'
const order = await CustomerConnectOrder.findByOrderNumber('75938');
console.log('Status:', order.status);
console.log('Has items:', order.items?.length > 0);
console.log('Processed:', order.stockProcessed);

// Invoices must be complete
const invoice = await RouteStarInvoice.findByInvoiceNumber('NRV7339');
console.log('Complete:', invoice.isComplete);
console.log('Status:', invoice.status);
console.log('Processed:', invoice.stockProcessed);
```

**Manually reprocess:**
```javascript
// Reset processing flag
order.stockProcessed = false;
await order.save();

// Then trigger sync
POST /api/customerconnect/sync/stock
```

## Performance Optimization

### Adjust Limits

For faster syncs with large datasets:

```env
# Process fewer records per sync
ORDERS_SYNC_LIMIT=50
INVOICES_SYNC_LIMIT=50
```

### Run More Frequently

For near real-time inventory:

```env
# Every 2 hours
SYNC_CRON_EXPRESSION=0 */2 * * *
```

### Separate Schedules

For different sync times:

```javascript
// In custom script
const { getInventoryScheduler } = require('./services/inventoryScheduler.service');
const scheduler = getInventoryScheduler();

// Start with custom cron for each
scheduler.start({
  cronExpression: '0 2 * * *', // Orders at 2 AM
  // ... config
});
```

## Testing

### Test Manually

```bash
# Test CustomerConnect sync
node test-customerconnect-sync.js

# Test RouteStar sync
node test-routestar-sync.js

# Test complete sync
node test-complete-sync.js
```

### Test API

```bash
# Start scheduler
curl -X POST http://localhost:5001/api/inventory-scheduler/start \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check status
curl http://localhost:5001/api/inventory-scheduler/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# Run immediately
curl -X POST http://localhost:5001/api/inventory-scheduler/run-now \
  -H "Authorization: Bearer YOUR_TOKEN"

# Stop scheduler
curl -X POST http://localhost:5001/api/inventory-scheduler/stop \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Best Practices

1. **Run during off-hours** - 3 AM minimizes portal load
2. **Monitor sync logs** - Set up alerts for failed syncs
3. **Review unprocessed items** - Check daily for stuck records
4. **Backup before first sync** - Ensure data safety
5. **Test with small limits** - Verify everything works
6. **Set up notifications** - Email alerts for sync failures
7. **Regular reconciliation** - Compare portal totals vs database

## Support

For issues or questions:
- Check logs: `logs/app.log`
- Review documentation: `docs/COMPLETE_INVENTORY_ARCHITECTURE.md`
- API endpoints: `GET /api/inventory-scheduler/status`
