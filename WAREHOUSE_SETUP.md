# Warehouse Stock Management System - Setup Guide

## Current Status

✅ **COMPLETE** - Backend infrastructure is fully implemented
✅ **COMPLETE** - API endpoints for sync, warehouse data, and scheduler
✅ **COMPLETE** - Automation framework with enhanced error handling and logging
⚠️ **NEEDS CONFIGURATION** - Selectors must be updated for actual portal pages
⚠️ **PENDING** - Frontend UI pages

## Overview

The system automatically:
1. Logs into CustomerConnect EnviroStore
2. Fetches purchase orders → Creates stock IN movements
3. Logs into RouteStar
4. Fetches invoices/sales → Creates stock OUT movements
5. Maintains real-time stock levels in MongoDB
6. Can run on a schedule or be triggered manually via API

## Before You Start

### 1. Install Playwright Browsers

```bash
cd /Users/yaswanthgandhi/Documents/seo/server
npx playwright install chromium
```

This downloads the Chromium browser needed for automation.

### 2. Configure Environment Variables

Copy or update your `.env` file with these values:

```env
# Portal Credentials
CUSTOMERCONNECT_BASE_URL=https://envirostore.mycustomerconnect.com
CUSTOMERCONNECT_USERNAME=your_username_here
CUSTOMERCONNECT_PASSWORD=your_password_here

ROUTESTAR_BASE_URL=https://emnrv.routestar.online
ROUTESTAR_USERNAME=your_username_here
ROUTESTAR_PASSWORD=your_password_here

# Automation Settings
HEADLESS=false  # Set to false for testing to see the browser
BROWSER_TIMEOUT=30000

# Scheduler Settings
AUTO_START_SCHEDULER=false  # Set true to auto-start on server launch
SYNC_INTERVAL_MINUTES=30

# Timezone
TZ=America/New_York
```

## Critical Step: Update CSS Selectors

**This is the most important step!** The automation code uses CSS selectors to find elements on the web pages. These selectors are currently TEMPLATES and must be updated with actual selectors from the portals.

### How to Find Correct Selectors

#### For CustomerConnect EnviroStore:

1. **Open the portal** in Chrome/Edge:
   ```
   https://envirostore.mycustomerconnect.com
   ```

2. **Log in manually** with your credentials

3. **Inspect the login page** (before logging in):
   - Right-click on the **Username field** → Inspect
   - In DevTools, find the `<input>` element
   - Right-click on the HTML element → Copy → Copy selector
   - Paste this into `src/selectors/customerconnect.selectors.js` under `login.usernameInput`
   - Repeat for password field and login button

4. **After logging in, find the logged-in indicator**:
   - Look for an element that ONLY appears when logged in (user menu, logout button, dashboard header)
   - Inspect it and copy the selector
   - Update `login.loggedInIndicator`

5. **Navigate to the Orders page**:
   - Find the link/button that goes to orders
   - Copy its selector → Update `navigation.ordersLink`

6. **Inspect the Orders list/table**:
   - Find the selector for the orders table → Update `ordersList.ordersTable`
   - Find selector for table rows → Update `ordersList.orderRows`
   - For each column (order number, date, status, total), copy the selector for the cell
   - Update `ordersList.orderNumber`, `ordersList.orderDate`, etc.

7. **Click on an order to see details**:
   - Inspect all the fields (vendor info, line items table, totals)
   - Update all selectors in the `orderDetail` section

#### For RouteStar:

Follow the same process for:
```
https://emnrv.routestar.online
```

Update selectors in `src/selectors/routestar.selectors.js`

### Example Selector Update

**Before (template):**
```javascript
usernameInput: 'input[name="username"], input[type="email"], #username, #email'
```

**After (actual selector from website):**
```javascript
usernameInput: '#user_email'  // This is the actual selector after inspecting
```

### Files to Update:
- `/src/selectors/customerconnect.selectors.js`
- `/src/selectors/routestar.selectors.js`

## Testing the Automation

### Test 1: Manual Login Test

Create a test script to verify login works:

```javascript
// test-login.js
const CustomerConnectAutomation = require('./src/automation/customerconnect');

async function test() {
  const automation = new CustomerConnectAutomation();

  try {
    await automation.init();
    console.log('Browser initialized');

    await automation.login();
    console.log('Login successful!');

    await automation.takeScreenshot('test-success');

    // Keep browser open for 10 seconds to inspect
    await automation.page.waitForTimeout(10000);
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await automation.close();
  }
}

test();
```

Run it:
```bash
node test-login.js
```

### Test 2: Fetch Orders Test

```javascript
// test-orders.js
const CustomerConnectAutomation = require('./src/automation/customerconnect');

async function test() {
  const automation = new CustomerConnectAutomation();

  try {
    await automation.init();
    await automation.login();

    const orders = await automation.fetchOrdersList(5);
    console.log('Fetched orders:', JSON.stringify(orders, null, 2));
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await automation.close();
  }
}

test();
```

### Test 3: Full Sync via API

Start your server:
```bash
npm start
```

Trigger a sync manually (requires admin authentication):
```bash
# Login first to get JWT token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your_password"}'

# Use the token to trigger sync
curl -X POST http://localhost:5000/api/sync/customerconnect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"limit":10,"processStock":true}'
```

## How the System Works

### Flow Diagram:

```
┌─────────────────────────────────────────┐
│  Scheduler (Optional, Auto-starts)      │
│  Runs every X minutes                   │
└──────────────┬──────────────────────────┘
               │
               ├──► CustomerConnect Sync
               │    1. Launch browser
               │    2. Login
               │    3. Navigate to orders
               │    4. Fetch order list
               │    5. For each order:
               │       - Get order details
               │       - Save to PurchaseOrder model
               │       - Map SKUs (auto-create if needed)
               │       - Create stock IN movements
               │    6. Update StockSummary
               │    7. Save sync log
               │
               └──► RouteStar Sync
                    1. Launch browser
                    2. Login
                    3. Navigate to invoices
                    4. Fetch invoice list
                    5. For each invoice:
                       - Get invoice details
                       - Save to ExternalInvoice model
                       - Map SKUs
                       - Create stock OUT movements
                    6. Update StockSummary
                    7. Save sync log
```

### Database Models:

- **Product** - Product master data with SKU and aliases
- **PurchaseOrder** - Orders from CustomerConnect
- **ExternalInvoice** - Invoices/sales from RouteStar
- **StockMovement** - Audit trail of all stock changes
- **StockSummary** - Current stock levels (fast lookup)
- **SyncLog** - History of sync operations

### Stock Processing Logic:

**IN movements** (Purchase Orders):
- Only processes orders with status: `confirmed`, `received`, or `completed`
- Checks `stockProcessed` flag to avoid duplicates

**OUT movements** (Invoices):
- Only processes invoices with status: `paid`, `delivered`, or `completed`
- Checks `stockProcessed` flag to avoid duplicates

### SKU Mapping:

If an external product name doesn't match any known SKU or alias:
1. System generates temporary SKU: `TEMP-ABC-1234567890`
2. Creates unmapped product entry
3. Admin can manually map via API: `POST /api/warehouse/map-sku`

## API Endpoints

### Sync Endpoints (Admin only):

```
POST /api/sync/customerconnect    - Trigger CustomerConnect sync
POST /api/sync/routestar          - Trigger RouteStar sync
GET  /api/sync/logs               - View sync history
GET  /api/sync/status             - Get latest sync status
GET  /api/sync/stats              - Get sync statistics
```

### Warehouse Endpoints (Authenticated):

```
GET  /api/warehouse/purchase-orders         - List purchase orders
GET  /api/warehouse/purchase-orders/:id     - Get order details
GET  /api/warehouse/invoices                - List invoices
GET  /api/warehouse/invoices/:id            - Get invoice details
GET  /api/warehouse/stock                   - Stock summary
GET  /api/warehouse/stock/:sku/movements    - Movement history
POST /api/warehouse/stock/:sku/adjust       - Manual adjustment (admin)
GET  /api/warehouse/sales/summary           - Sales statistics
GET  /api/warehouse/unmapped-products       - Products needing mapping (admin)
POST /api/warehouse/map-sku                 - Map temporary SKU (admin)
```

### Scheduler Endpoints (Admin only):

```
GET  /api/scheduler/status    - Check if scheduler is running
POST /api/scheduler/start     - Start automated syncing
POST /api/scheduler/stop      - Stop automated syncing
POST /api/scheduler/run-now   - Trigger immediate sync
```

## Monitoring and Debugging

### Logs to Check:

1. **Console logs** - Detailed step-by-step progress
2. **Screenshots** - Saved to `uploads/screenshots/` on errors
3. **Sync logs** - In database (SyncLog model)

### Common Issues:

**Issue: Login fails**
- Check selectors are correct
- Verify credentials in .env
- Check screenshot to see what page it's on
- Website may have changed - update selectors

**Issue: Orders not found**
- Check `ordersList.ordersTable` selector
- Check `ordersList.orderRows` selector
- Take screenshot to see if table is loading

**Issue: Data extraction returns null**
- Individual field selectors are incorrect
- Inspect the page and update selectors

**Issue: Duplicate stock movements**
- Check `stockProcessed` flag logic
- Ensure `sourceOrderId` / `sourceInvoiceId` is unique

## What's Next

1. **Update selectors** (critical!)
2. **Test automation** with headless=false to watch it work
3. **Verify data** is being saved to MongoDB correctly
4. **Build frontend** to display data and control syncs
5. **Enable scheduler** for production

## Frontend (To Be Built)

The frontend should include:
- Dashboard with stock overview and sync status
- Purchase orders list/detail pages
- Invoices/sales list/detail pages
- Stock management (view levels, history, manual adjustments)
- Reports and analytics
- Manual sync trigger buttons
- SKU mapping interface for unmapped products

## Questions to Answer Before Testing

1. **What are the exact status values** for orders/invoices that should trigger stock movements?
   - Currently using: `['confirmed', 'received', 'completed']` for orders
   - Currently using: `['paid', 'delivered', 'completed']` for invoices
   - Confirm these match the actual portal status values

2. **How do you want to handle duplicate products?**
   - Auto-merge by name similarity?
   - Manual mapping only?
   - Current implementation: Creates TEMP SKUs for manual mapping

3. **Timezone considerations**
   - Order/invoice dates coming from portals - what timezone?
   - Currently assuming server timezone

## Support

If you encounter issues:
1. Check console logs for detailed error messages
2. Review screenshots in `uploads/screenshots/`
3. Verify selectors match the actual portal HTML
4. Test with `HEADLESS=false` to watch the automation
