# Updated API Endpoints - Inventory Sync Integration

## Overview
All backend controllers have been updated to integrate with the new CustomerConnect (orders) and RouteStar (invoices) sync system. This document outlines all the new and updated endpoints.

---

## 📦 Inventory Endpoints

### Existing Endpoints (Updated)
- `GET /api/inventory` - Now supports `?includeSyncStatus=true` parameter
- `GET /api/inventory/:id` - Now includes sync metadata and enriched stock history
- `GET /api/inventory/:id/history` - Now includes StockMovement data merged with manual history
- `PATCH /api/inventory/:id/stock` - Now creates StockMovement records automatically

### New Endpoints
- `GET /api/inventory/sync-source` - Get inventory grouped by source (CustomerConnect/RouteStar)
- `GET /api/inventory/stock-movements` - Get stock movements with filters
- `GET /api/inventory/sync-health` - Get sync health for inventory
- `GET /api/inventory/:id/sync-info` - Get sync info for specific item
- `GET /api/inventory/sync-status` - Get sync status of all inventory items

**Query Parameters:**
```
?includeSyncStatus=true - Include sync metadata in responses
?source=CustomerConnect|RouteStar - Filter by sync source
?page=1&limit=50 - Pagination
```

**Response includes:**
```json
{
  "_id": "...",
  "itemName": "Product Name",
  "skuCode": "SKU123",
  "sync": {
    "lastSyncedAt": "2024-01-15T03:00:00.000Z",
    "syncSource": "CustomerConnect, RouteStar",
    "hasSyncedData": true
  }
}
```

---

## 📊 Report Endpoints

### Existing Endpoints (Updated)
All report endpoints now include sync metadata:
- `GET /api/reports/dashboard` - Includes comprehensive sync status widget
- `GET /api/reports/stock-summary` - Includes sync metadata per item
- `GET /api/reports/profit-margin` - Includes sync statistics
- `GET /api/reports/reorder-list` - Includes sync status per item
- `GET /api/reports/sales` - Includes last sync info
- `GET /api/reports/valuation` - Includes sync statistics
- `GET /api/reports/top-selling` - Includes sync info
- `GET /api/reports/customers` - Includes sync info
- `GET /api/reports/low-stock` - Includes sync status per item
- `GET /api/reports/profit-analysis` - Includes sync info

### New Endpoints
- `GET /api/reports/inventory-sync-status` - Comprehensive sync health report
- `GET /api/reports/sync-history` - Recent sync history with details
- `GET /api/reports/stock-processing-status` - Pending stock movements
- `GET /api/reports/dashboard-sync-widget` - Dashboard sync widget data

**Dashboard Sync Widget Response:**
```json
{
  "success": true,
  "data": {
    "lastSyncTimes": {
      "customerConnect": { "timestamp": "...", "status": "SUCCESS", "duration": 145 },
      "routeStar": { "timestamp": "...", "status": "SUCCESS", "duration": 187 }
    },
    "successRates": {
      "customerConnect": { "rate": 98.5, "successful": 68, "failed": 1 },
      "routeStar": { "rate": 100, "successful": 70, "failed": 0 }
    },
    "pendingStockMovements": { "count": 5 },
    "syncErrors": { "count": 1, "errors": [...] },
    "dataFreshness": {
      "customerConnect": { "status": "fresh", "color": "green", "label": "5 mins ago" },
      "routeStar": { "status": "fresh", "color": "green", "label": "3 mins ago" },
      "overall": { "status": "fresh", "color": "green" }
    },
    "nextScheduledSync": {
      "schedulerRunning": true,
      "nextSyncTime": "2024-01-16T03:00:00.000Z"
    }
  }
}
```

---

## 💰 Purchase Endpoints

### Existing Endpoints (Updated)
- `POST /api/purchases` - Now creates StockMovement records
- `GET /api/purchases/inventory/:inventoryId` - Now supports `?source=manual|customerconnect` filter
- `GET /api/purchases/:id` - Now includes sync metadata and related stock movements
- `PUT /api/purchases/:id` - Protected for synced purchases
- `DELETE /api/purchases/:id` - Protected for synced purchases

### New Endpoints
- `GET /api/purchases/unprocessed` - Get unprocessed purchase orders from CustomerConnect
- `GET /api/purchases/analytics` - Get purchase analytics by source

**Purchase Response with Sync Metadata:**
```json
{
  "_id": "...",
  "inventoryItem": {...},
  "quantity": 100,
  "totalCost": 1000,
  "syncInfo": {
    "source": "customerconnect",
    "isSynced": true,
    "syncedAt": "2024-01-15T03:00:00.000Z"
  },
  "purchaseOrderInfo": {
    "orderNumber": "75938",
    "status": "Complete",
    "vendor": "Vendor Name",
    "lastSyncedAt": "2024-01-15T03:00:00.000Z"
  },
  "stockMovements": [...]
}
```

---

## 🧾 Invoice Endpoints

### Existing Endpoints (Updated)
- `POST /api/invoices` - Now creates StockMovement records (type: OUT)
- `GET /api/invoices` - Now supports `?source=manual|routestar` filter
- `GET /api/invoices/:id` - Now includes sync metadata and stock movements
- `PUT /api/invoices/:id` - Now creates adjustment StockMovements
- `DELETE /api/invoices/:id` - Now restores stock with StockMovements

### New Endpoints
- `GET /api/invoices/unprocessed` - Get unprocessed invoices from RouteStar
- `GET /api/invoices/synced` - Get invoices filtered by sync source
- `GET /api/invoices/:id/stock-movements` - Get stock movements for an invoice

**Invoice Response with Sync Metadata:**
```json
{
  "_id": "...",
  "invoiceNumber": "INV-1001",
  "items": [...],
  "syncInfo": {
    "source": "routestar",
    "isSynced": true,
    "sourceInvoiceId": "NRV7339",
    "lastSyncedAt": "2024-01-15T03:00:00.000Z"
  },
  "stockMovements": [...]
}
```

---

## 🏭 Warehouse Endpoints

### Existing Endpoints (Updated)
- `GET /api/warehouse/purchase-orders` - Now includes `?includeSync=true` parameter
- `GET /api/warehouse/external-invoices` - Now includes `?includeSync=true` parameter
- `GET /api/warehouse/stock-movements` - Now includes sync source metadata

### New Endpoints
- `GET /api/warehouse/sync/health` - Warehouse sync health monitoring
- `GET /api/warehouse/sync/stats` - Detailed sync statistics
- `GET /api/warehouse/sync/unprocessed` - Unprocessed sync items
- `POST /api/warehouse/sync/retry-processing` - Retry failed stock processing

**Sync Health Response:**
```json
{
  "healthScore": 95,
  "healthStatus": "excellent",
  "customerConnect": {
    "lastSync": "2024-01-15T03:00:00.000Z",
    "totalOrders": 172,
    "unprocessed": 0,
    "errors": 0
  },
  "routeStar": {
    "lastSync": "2024-01-15T03:05:00.000Z",
    "totalInvoices": 145,
    "unprocessed": 0,
    "errors": 0
  },
  "recommendations": []
}
```

---

## 🔄 Sync Endpoints

### Existing Endpoints (Updated)
- `POST /api/sync/customerconnect` - Trigger CustomerConnect sync
- `POST /api/sync/routestar` - Trigger RouteStar sync
- `GET /api/sync/logs` - Get sync logs
- `GET /api/sync/status` - Get latest sync status
- `GET /api/sync/stats` - Get sync statistics

### New Endpoints
- `GET /api/sync/health` - Detailed sync health status
- `POST /api/sync/retry-failed` - Retry failed syncs
- `POST /api/sync/reprocess-stock` - Reprocess failed stock movements
- `GET /api/sync/performance` - Sync performance metrics
- `GET /api/sync/inventory-analytics` - Inventory analytics from sync data

**Sync Health Response:**
```json
{
  "overall": {
    "status": "healthy",
    "score": 95
  },
  "customerConnect": {
    "status": "healthy",
    "lastSync": "2024-01-15T03:00:00.000Z",
    "successRate": 98.5,
    "avgDuration": 145,
    "unprocessedStock": 0
  },
  "routeStar": {
    "status": "healthy",
    "lastSync": "2024-01-15T03:05:00.000Z",
    "successRate": 100,
    "avgDuration": 187,
    "unprocessedStock": 0
  }
}
```

**Retry Failed Syncs:**
```bash
POST /api/sync/retry-failed
{
  "syncLogId": "...",  # Retry specific sync
  # OR
  "source": "customerconnect",  # Retry all failed for source
  "hours": 24  # Within last 24 hours
}
```

**Reprocess Failed Stock:**
```bash
POST /api/sync/reprocess-stock
{
  "recordIds": ["...", "..."],  # Specific records
  # OR
  "all": true,  # Reprocess all
  "source": "customerconnect",  # Optional filter
  "type": "purchase_order"  # Optional filter
}
```

---

## 📈 Analytics Service

New service: `inventoryAnalytics.service.js`

### Available Methods:
1. **`getSyncHealthStatus()`** - Overall sync health metrics
2. **`getStockMovementAnalytics(options)`** - Stock movement statistics
3. **`getSyncTrends(options)`** - Sync performance over time
4. **`getUnprocessedRecords(options)`** - Pending stock movements
5. **`getInventorySourceBreakdown(options)`** - Items by source breakdown
6. **`getSyncErrorAnalysis(options)`** - Error analysis

---

## 🔐 Authentication

All endpoints require authentication via Bearer token:
```
Authorization: Bearer <your-jwt-token>
```

Most sync and warehouse endpoints require **Admin** role.

---

## 📊 Common Response Format

### Success Response
```json
{
  "success": true,
  "data": {...}
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

---

## 🎯 Key Features

### 1. Sync Metadata Everywhere
Every inventory item, purchase, and invoice now includes sync metadata showing:
- Which system it came from (manual, CustomerConnect, RouteStar)
- When it was last synced
- Sync status and processing state

### 2. Complete Stock Movement Tracking
All stock changes now create StockMovement records:
- Type: IN (purchases), OUT (sales), ADJUST (adjustments)
- Reference to source (order, invoice, manual)
- Complete audit trail

### 3. Health Monitoring
Comprehensive health monitoring across all endpoints:
- Real-time sync status
- Success rates and performance metrics
- Pending and failed processing tracking
- Actionable recommendations

### 4. Source Filtering
Filter data by source across all endpoints:
- `?source=manual` - Manual entries only
- `?source=customerconnect` - CustomerConnect synced data
- `?source=routestar` - RouteStar synced data

### 5. Error Recovery
Built-in retry mechanisms:
- Retry failed syncs
- Reprocess failed stock movements
- Detailed error tracking and analysis

---

## 🚀 Quick Start

### 1. Check Sync Health
```bash
GET /api/reports/dashboard-sync-widget
GET /api/sync/health
GET /api/warehouse/sync/health
```

### 2. View Synced Inventory
```bash
GET /api/inventory?includeSyncStatus=true
GET /api/inventory/sync-source?source=CustomerConnect
```

### 3. Check Stock Movements
```bash
GET /api/inventory/stock-movements
GET /api/warehouse/stock-movements
```

### 4. Monitor Performance
```bash
GET /api/sync/performance
GET /api/reports/inventory-sync-status
```

### 5. Handle Errors
```bash
GET /api/sync/health  # Check for errors
POST /api/sync/retry-failed  # Retry failed syncs
POST /api/sync/reprocess-stock  # Reprocess failed stock
```

---

## 📝 Notes

- All sync operations run automatically at 3 AM daily
- Scheduler fetches ALL data (no limits)
- Duplicate prevention built-in
- Complete audit trail maintained
- Real-time health monitoring
- Backward compatible with existing code
