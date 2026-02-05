# Test Files .env Path Fix

## Issue Detected
After moving test files from root directory to `tests/` directory, all tests were failing with:
```
❌ TEST FAILED
Error: Login configuration missing
URL: undefined/web/login/
Username: undefined
```

## Root Cause
When test files were in the root directory, they used:
```javascript
require('dotenv').config();
```

This worked because dotenv looks for `.env` in the **current working directory**, which was the root.

After moving to `tests/` directory, dotenv was looking for `.env` in the wrong location:
- **Looking for:** `tests/.env` (doesn't exist)
- **Should look in:** `.env` (root directory)

## Solution Applied

Updated all 6 test files from:
```javascript
// Load environment variables from .env file
require('dotenv').config();
```

To:
```javascript
// Load environment variables from .env file
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
```

This explicitly tells dotenv to load the `.env` file from the parent directory (root), regardless of where the test is executed from.

## Files Updated
✅ `tests/test-customerconnect.js`
✅ `tests/test-customerconnect-sync.js`
✅ `tests/test-routestar.js`
✅ `tests/test-routestar-sync.js`
✅ `tests/test-closedinvoices.js`
✅ `tests/test-scheduler.js`

**Total:** 6 files updated

## Verification

### Environment Variables Loading Test
```bash
✓ CustomerConnect URL: Loaded
✓ CustomerConnect Username: Loaded
✓ RouteStar URL: Loaded
```

### How to Test
Run any test to verify it now loads environment variables correctly:
```bash
npm run test:customerconnect
npm run test:routestar
npm run test:all
```

## Why This Fix Works

### Before (Broken)
```javascript
require('dotenv').config();
// Looks for: ./tests/.env ❌
// Current working directory: tests/
```

### After (Fixed)
```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
// Looks for: ./.env ✓
// __dirname = /path/to/server/tests
// ../  = /path/to/server
// ../. env = /path/to/server/.env ✓
```

## Best Practice for Test Files

When test files are in subdirectories, always use explicit paths for `.env`:

```javascript
// ✓ GOOD - Works from any location
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ✗ BAD - Only works if tests are in root
require('dotenv').config();
```

## Status
✅ **All test files fixed**
✅ **Environment variables loading correctly**
✅ **Tests ready to run**

---

**Fixed by:** Claude Sonnet 4.5
**Date:** 2026-02-05
**Files Updated:** 6 test files
