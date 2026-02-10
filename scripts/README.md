# Utility Scripts

This folder contains utility scripts for database management, debugging, and testing the automation system.

## Scripts Overview

| Script | Purpose | Frequency |
|--------|---------|-----------|
| check-automation-data.js | Verify automation data in database | As needed |
| clear-orders.js | Delete all CustomerConnect orders | Rarely (testing only) |
| debug-customerconnect-selectors.js | Debug CSS selectors | When UI changes |
| trigger-sync.js | Manually trigger all syncs | As needed |
| fix-wheat-stock.js | One-time data fix (legacy) | Not needed anymore |

---

## Detailed Documentation

### 1. check-automation-data.js
**Purpose:** Check automation data status in the database

**Usage:**
```bash
node scripts/check-automation-data.js
```

**What it does:**
- Connects to MongoDB
- Counts CustomerConnect orders, RouteStar invoices, stock movements, and summaries
- Shows sample data from each collection
- Displays sync status of inventory items
- Provides summary and warnings

**When to use:**
- After running a sync to verify data was saved
- To debug sync issues
- To check if inventory items are properly linked to automation data

---

### 2. clear-orders.js
**Purpose:** Delete all CustomerConnect orders from the database

**Usage:**
```bash
node scripts/clear-orders.js
```

**What it does:**
- Connects to MongoDB
- Counts current orders
- Deletes all CustomerConnect orders
- Verifies deletion

**When to use:**
- Before testing the scraper with fresh data
- To clean up test data
- When you need to re-sync all orders from scratch

**⚠️ Warning:** This permanently deletes all orders. You'll need to re-sync from CustomerConnect portal.

---

### 3. debug-customerconnect-selectors.js
**Purpose:** Debug CSS selectors for CustomerConnect portal

**Usage:**
```bash
node scripts/debug-customerconnect-selectors.js
```

**What it does:**
- Launches a browser (NOT headless)
- Logs into CustomerConnect
- Navigates to orders page
- Prints HTML structure of order rows
- Extracts and displays all links and data fields
- Keeps browser open for 60 seconds for manual inspection

**When to use:**
- When CustomerConnect UI changes and scraper breaks
- To identify correct CSS selectors for order elements
- To debug order data extraction issues
- To inspect the actual HTML structure

**Environment variables required:**
- `CUSTOMER_CONNECT_URL`
- `CUSTOMER_CONNECT_USERNAME`
- `CUSTOMER_CONNECT_PASSWORD`

---

### 4. trigger-sync.js
**Purpose:** Trigger all automation syncs via API

**Usage:**
```bash
node scripts/trigger-sync.js
```

**What it does:**
1. Logs in as admin
2. Checks scheduler status
3. Starts schedulers
4. Triggers CustomerConnect order sync
5. Processes CustomerConnect stock
6. Triggers RouteStar invoice sync (pending and closed)
7. Processes RouteStar stock
8. Checks unprocessed items

**When to use:**
- To manually trigger a full sync
- For testing the complete automation flow
- After fixing bugs to re-sync data
- To verify API endpoints are working

**Environment variables required:**
- `PORT` (default: 5001)

**Prerequisites:**
- Backend server must be running on `http://localhost:5001` (or your configured PORT)
- Admin credentials: `username: admin`, `password: admin123`

---

### 5. fix-wheat-stock.js
**Purpose:** One-time fix for Wheat inventory item quantity structure

**Usage:**
```bash
node scripts/fix-wheat-stock.js
```

**What it does:**
- Connects to MongoDB
- Finds the Wheat inventory item
- Fixes the quantity structure to match the schema (current, minimum, unit)
- Sets quantity to { current: 200, minimum: 0, unit: 'kg' }

**When to use:**
- This was a one-time fix for a specific data issue
- Generally not needed unless you have similar data structure issues
- Can be used as a template for fixing other inventory items

**Note:** This is a legacy script from a specific bug fix. You can delete it if no longer needed.

---

## Environment Setup

All scripts require a `.env` file in the server root with:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/your-database

# CustomerConnect
CUSTOMER_CONNECT_URL=https://envirostore.mycustomerconnect.com
CUSTOMER_CONNECT_USERNAME=your-username
CUSTOMER_CONNECT_PASSWORD=your-password

# RouteStar
ROUTESTAR_URL=https://emnrv.routestar.online
ROUTESTAR_USERNAME=your-username
ROUTESTAR_PASSWORD=your-password

# Server
PORT=5001
```

---

## Quick Commands (Using npm scripts)

For convenience, you can use these npm scripts from the `scripts/` directory:

```bash
cd scripts

# Check automation data
npm run check-data

# Clear all orders
npm run clear-orders

# Debug CustomerConnect selectors
npm run debug-selectors

# Trigger full sync
npm run trigger-sync

# Fix wheat stock (legacy)
npm run fix-wheat
```

Or run directly:

```bash
# From server root
node scripts/check-automation-data.js
node scripts/clear-orders.js
node scripts/debug-customerconnect-selectors.js
node scripts/trigger-sync.js
node scripts/fix-wheat-stock.js
```

---

## Common Workflows

### After fixing a scraper bug:
```bash
# 1. Clear old data
node scripts/clear-orders.js

# 2. Start the server
npm start

# 3. Trigger a fresh sync
node scripts/trigger-sync.js

# 4. Verify data was saved correctly
node scripts/check-automation-data.js
```

### When selectors break:
```bash
# 1. Debug to find correct selectors
node scripts/debug-customerconnect-selectors.js

# 2. Update selectors in:
#    src/automation/selectors/customerconnect.selectors.js

# 3. Test the fix
node scripts/trigger-sync.js
```

### Regular monitoring:
```bash
# Check automation data status
node scripts/check-automation-data.js
```

---

## Notes

- All scripts automatically load environment variables from `.env`
- Scripts exit after completion (exit code 0 for success, 1 for errors)
- Logs are colored and formatted for readability
- Safe to run multiple times (except clear-orders.js which deletes data)

---

## Adding New Scripts

When creating new utility scripts:

1. Place them in this `scripts/` folder
2. Add proper error handling
3. Load environment variables: `require('dotenv').config()`
4. Add descriptive console output with emojis for readability
5. Document the script in this README
6. Use async/await for database operations
7. Always close database connections and exit properly
