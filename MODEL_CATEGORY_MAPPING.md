# Model Category Mapping Feature

## Overview
This feature allows you to map order model numbers (SKUs) from CustomerConnect orders to RouteStar item categories. This creates a bridge between your order data and your inventory catalog.

## What Was Created

### 1. Database Model
**File**: `src/models/ModelCategory.js`
- Stores mappings between model numbers and RouteStar item names
- Fields:
  - `modelNumber` - The SKU/model number from orders (unique, indexed)
  - `categoryItemName` - The name of the RouteStar item
  - `categoryItemId` - Reference to the RouteStarItem document
  - `notes` - Optional notes for the mapping
  - `createdBy` / `lastUpdatedBy` - User tracking
  - Timestamps (createdAt, updatedAt)

### 2. Backend API Routes
**File**: `src/routes/modelCategory.routes.js`

API endpoints:
- `GET /api/model-category/unique-models` - Get all unique SKUs from orders
- `GET /api/model-category/routestar-items` - Get all RouteStarItems for dropdown
- `POST /api/model-category/mapping` - Create or update a mapping
- `DELETE /api/model-category/mapping/:modelNumber` - Delete a mapping
- `GET /api/model-category/mappings` - Get all existing mappings

### 3. Frontend UI
**File**: `public/pages/model-category.html`

Features:
- ✅ Display all unique model numbers from CustomerConnect orders
- ✅ Show mapping status (Mapped/Unmapped) with colored badges
- ✅ Dropdown to select RouteStar item for each model
- ✅ Add notes for each mapping
- ✅ Filter by status (All/Mapped/Unmapped)
- ✅ Search functionality
- ✅ Real-time statistics (Total, Mapped, Unmapped)
- ✅ Individual save or bulk save all changes
- ✅ Delete existing mappings
- ✅ Responsive table with hover effects
- ✅ Beautiful gradient UI with alerts

### 4. Server Configuration
**Files Updated**:
- `src/server.js` - Added route registration and static file serving
- `src/config/initModels.js` - Added ModelCategory model for index creation

## How to Use

### Step 1: Start the Server
```bash
npm start
```

### Step 2: Access the UI
Open your browser and navigate to:
```
http://localhost:5000/pages/model-category.html
```

**Note**: You must be logged in first. If not logged in:
1. Go to your login page
2. Log in with your credentials
3. Then access the model-category page

### Step 3: Map Models to Categories

1. **View All Models**: The page automatically loads all unique SKUs from your CustomerConnect orders

2. **Check Statistics**: See at a glance:
   - Total number of unique models
   - How many are already mapped
   - How many still need mapping

3. **Filter Models**:
   - Click "All Models" to see everything
   - Click "Mapped" to see only mapped items
   - Click "Unmapped" to see items that need mapping

4. **Search**: Use the search box to quickly find specific model numbers

5. **Set Category**:
   - For each model, select a RouteStar item from the dropdown
   - The dropdown shows all items fetched from RouteStar
   - Add optional notes if needed

6. **Save Mapping**:
   - Click "💾 Save" next to each row to save individually
   - Or click "💾 Save All Changes" to save all modified rows at once

7. **Delete Mapping**:
   - Click the "🗑️" button next to a mapped item to remove the mapping

### Step 4: API Usage (For Developers)

#### Get Unique Models with Current Mappings
```javascript
GET /api/model-category/unique-models
Authorization: Bearer <your-token>

Response:
{
  "success": true,
  "data": {
    "models": [
      {
        "modelNumber": "SKU-123",
        "categoryItemName": "Widget A",
        "categoryItemId": "507f1f77bcf86cd799439011",
        "notes": "Popular item"
      }
    ],
    "total": 150
  }
}
```

#### Get RouteStar Items for Dropdown
```javascript
GET /api/model-category/routestar-items
Authorization: Bearer <your-token>

Response:
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "itemName": "Widget A",
        "itemParent": "Widgets",
        "description": "High quality widget"
      }
    ],
    "total": 500
  }
}
```

#### Create/Update Mapping
```javascript
POST /api/model-category/mapping
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "modelNumber": "SKU-123",
  "categoryItemName": "Widget A",
  "categoryItemId": "507f1f77bcf86cd799439011",
  "notes": "Popular item"
}

Response:
{
  "success": true,
  "message": "Mapping saved successfully",
  "data": { ... }
}
```

#### Delete Mapping
```javascript
DELETE /api/model-category/mapping/SKU-123
Authorization: Bearer <your-token>

Response:
{
  "success": true,
  "message": "Mapping deleted successfully"
}
```

## Use Cases

1. **Inventory Categorization**: Organize order items into logical categories
2. **Reporting**: Generate reports grouped by category
3. **Stock Management**: Track inventory by category rather than individual SKUs
4. **Order Processing**: Automatically assign categories to new orders based on SKU mappings
5. **Analytics**: Analyze sales trends by category

## Technical Details

### Authentication
All API endpoints require authentication. The frontend expects a JWT token stored in `localStorage` with the key `token`.

### Data Source
- **Model Numbers**: Extracted from `CustomerConnectOrder.items.sku`
- **Categories**: Fetched from `RouteStarItem.itemName`

### Database Indexes
The ModelCategory model has indexes on:
- `modelNumber` (unique, for fast lookups)
- `categoryItemName` (for filtering)
- `createdAt` (for sorting by creation date)

## Future Enhancements

Potential improvements:
- Bulk import/export via CSV
- Auto-suggest mappings based on text similarity
- Category groups/hierarchies
- Mapping history/audit trail
- Bulk operations (map all similar SKUs)
- Integration with other systems

## Troubleshooting

### "No models found"
- Make sure you have CustomerConnect orders in the database
- Run the order sync to fetch orders from CustomerConnect

### "Failed to load data"
- Check if you're logged in (auth token in localStorage)
- Verify the server is running
- Check browser console for errors

### Dropdown is empty
- Make sure you've run the items sync: `node test-items.js`
- Verify RouteStarItems exist in the database
- Check the API endpoint: `/api/model-category/routestar-items`

### Changes not saving
- Check browser console for errors
- Verify authentication token is valid
- Check server logs for error messages

## Summary

You now have a complete model category mapping system with:
- ✅ Database model for storing mappings
- ✅ REST API endpoints for CRUD operations
- ✅ Beautiful, responsive frontend UI
- ✅ Real-time statistics and filtering
- ✅ Search functionality
- ✅ Bulk operations support
- ✅ User-friendly interface with alerts

The system is ready to use! Just start your server and navigate to the page.
