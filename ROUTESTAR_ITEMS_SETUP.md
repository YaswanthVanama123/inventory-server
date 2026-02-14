# RouteStar Items Automation - Setup Complete ✅

## What Was Created

### 1. Database Model (`src/models/RouteStarItem.js`)
**Collection Name**: `routestaritems`

**Fields**:
- Item identification: `itemName`, `itemParent`, `description`
- Pricing: `purchaseCost`, `salesPrice`
- Item type: `type` (Inventory, Service, etc.)
- Quantities: `qtyOnOrder`, `qtyOnHand`, `qtyOnWarehouse`, `allocated`
- Item details: `mfgPartNumber`, `uom`, `category`, `department`, `grouping`, `taxCode`
- Links: `itemDetailUrl`, `warehouseDetailUrl`
- Sync metadata: `lastSynced`, `syncSource`
- Auto timestamps: `createdAt`, `updatedAt`

**Indexes Created** (10 total):
1. `itemName` - Fast lookup by name
2. `itemParent` - Fast lookup by parent category
3. `type` - Filter by item type
4. `qtyOnHand` - Find items by stock quantity
5. `category` - Filter by category
6. `department` - Filter by department
7. `lastSynced` - Sort by sync date
8. `category + department` - Compound filter
9. `mfgPartNumber` - Sparse index for manufacturer part numbers
10. `itemName + itemParent` - **UNIQUE** compound index

**Static Methods**:
- `findOrCreate(itemData)` - Upsert item
- `getByCategory(category)` - Get all items in category
- `getByDepartment(department)` - Get all items in department
- `getLowStock(threshold)` - Get items with qtyOnHand <= threshold
- `getItemsInStock()` - Get items with qtyOnHand > 0

**Virtual Fields**:
- `availableQuantity` - Calculated as `qtyOnHand - allocated`

### 2. Model Initialization (`src/config/initModels.js`)
- Automatically creates all MongoDB indexes when server starts
- Ensures database is ready for queries
- Logs success/failure for each model
- Non-blocking (server continues even if indexes fail)

### 3. API Endpoints (`src/routes/routestar.routes.js`)

**Sync Items**:
```
POST /api/routestar/sync/items
Body: { "limit": 0 }  // 0 = fetch all items
```

**Get Items with Filters**:
```
GET /api/routestar/items?page=1&limit=50
GET /api/routestar/items?category=Paper
GET /api/routestar/items?department=Chemicals
GET /api/routestar/items?type=Inventory
GET /api/routestar/items?inStock=true
GET /api/routestar/items?searchTerm=HARDWOUND
```

**Get Low Stock Items**:
```
GET /api/routestar/items/low-stock?threshold=10
```

**Delete All Items**:
```
DELETE /api/routestar/items/all
```

### 4. Automation Components

**Navigator** (`src/automation/navigators/routestar.navigator.js`):
- `navigateToItems()` - Navigate to items page with robust waiting
- 5-minute timeout with progress logging every 30 seconds
- Takes screenshots every 30 seconds for debugging

**Fetcher** (`src/automation/fetchers/RouteStarItemsFetcher.js`):
- `fetchItems(limit)` - Fetch items with pagination
- Extracts all 17 columns from items table
- Handles pagination correctly (fixed the jumping bug)
- Parses prices, quantities, and text fields

**Sync Service** (`src/services/routeStarSync.service.js`):
- `syncItems(limit)` - Main sync method
- Creates or updates items in database
- Tracks sync statistics (created, updated, failed)
- Creates sync log entries

### 5. Scheduler (`src/services/scheduler.js`)

**Daily Sync at 3:00 AM**:
- Cron expression: `0 3 * * *`
- Timezone: `America/New_York` (configurable via `TZ` env var)
- Fetches ALL items (limit: Infinity)
- Runs in headless mode (browser hidden)
- Comprehensive logging with success/failure tracking

**Status Endpoint**:
```
GET /api/scheduler/status
```
Returns:
```json
{
  "isRunning": true,
  "lastRun": {
    "customerConnect": "2025-02-14T08:00:00Z",
    "routeStar": "2025-02-14T08:15:00Z",
    "routeStarItems": "2025-02-14T03:00:00Z"
  },
  "tasks": {
    "customerConnect": "scheduled",
    "routeStar": "scheduled",
    "routeStarItems": "scheduled (daily 3:00 AM)"
  }
}
```

## How Model Indexes Are Created

### Automatic Creation on Server Start

When the server starts:

1. **Database Connection** (`src/config/database.js`)
   - Connects to MongoDB via `MONGODB_URI`

2. **Model Initialization** (`src/config/initModels.js`)
   - Imports all 17 models (including `RouteStarItem`)
   - Calls `model.createIndexes()` for each model
   - Logs progress and results

3. **Index Creation in MongoDB**
   - MongoDB creates indexes in the background
   - Uses `background: true` to avoid blocking
   - Unique indexes enforce data integrity

### Verify Indexes Were Created

**Check MongoDB**:
```bash
# Connect to MongoDB
mongosh "mongodb+srv://foodadmin:Yaswanth123@cluster0.0wuz8fl.mongodb.net/inventory_db"

# List indexes for RouteStarItem collection
use inventory_db
db.routestaritems.getIndexes()
```

**Check Server Logs**:
When the server starts, you should see:
```
MongoDB Connected: cluster0.0wuz8fl.mongodb.net
Initializing models and creating indexes...
  ✓ User: Created 3 indexes
  ✓ Inventory: Created 5 indexes
  ...
  ✓ RouteStarItem: Created 10 indexes

✅ Models initialized: 17/17 successful
   Total indexes created: 87
```

## Configuration

### Environment Variables (`.env`)

```bash
# Browser runs in headless mode (hidden)
HEADLESS=true

# Database connection
MONGODB_URI=mongodb+srv://foodadmin:Yaswanth123@...

# Scheduler timezone (affects 3 AM sync time)
TZ=America/New_York

# Auto-start scheduler on server start
AUTO_START_SCHEDULER=true
```

## Testing

### Test Model Creation

Run this command to verify the model:
```bash
node -e "
const mongoose = require('mongoose');
const RouteStarItem = require('./src/models/RouteStarItem');
console.log('Model:', RouteStarItem.modelName);
console.log('Collection:', RouteStarItem.collection.name);
console.log('Indexes:', RouteStarItem.schema.indexes().length);
"
```

Expected output:
```
Model: RouteStarItem
Collection: routestaritems
Indexes: 10
```

### Test Items Sync (Manual)

```bash
# Start server
npm start

# Call sync endpoint (in another terminal)
curl -X POST http://localhost:5001/api/routestar/sync/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"limit": 0}'
```

### Test Scheduled Sync

To test the 3 AM sync without waiting:
1. Change cron expression in `scheduler.js` line 106
2. From: `'0 3 * * *'` (3 AM daily)
3. To: `'*/5 * * * *'` (every 5 minutes)
4. Restart server and watch logs

## What Happens on Server Start

1. ✅ Load environment variables from `.env`
2. ✅ Connect to MongoDB
3. ✅ **Initialize all models and create indexes** ← NEW!
4. ✅ Register all routes (including items endpoints)
5. ✅ Start scheduler (if `AUTO_START_SCHEDULER=true`)
6. ✅ Schedule items sync for 3:00 AM daily
7. ✅ Server ready to accept requests

## Summary

✅ **Model Created**: RouteStarItem with 10 indexes
✅ **Indexes Auto-Created**: On server start via initModels.js
✅ **API Endpoints**: 4 endpoints for items management
✅ **Automation**: Navigator, Fetcher, and Sync Service
✅ **Scheduler**: Daily sync at 3:00 AM
✅ **Headless Mode**: Browser runs hidden (HEADLESS=true)
✅ **Pagination Fixed**: No more jumping by 10 pages

The model is now fully integrated and will be automatically initialized every time you start your server!
