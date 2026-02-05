# Test Configuration Verification

Run this before running tests to verify your configuration:

```bash
node -e "
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('=== Environment Variables Check ===\n');

console.log('CustomerConnect:');
console.log('  BASE_URL:', process.env.CUSTOMERCONNECT_BASE_URL ? '✓ SET' : '✗ MISSING');
console.log('  USERNAME:', process.env.CUSTOMERCONNECT_USERNAME ? '✓ SET' : '✗ MISSING');
console.log('  PASSWORD:', process.env.CUSTOMERCONNECT_PASSWORD ? '✓ SET (hidden)' : '✗ MISSING');

console.log('\nRouteStar:');
console.log('  BASE_URL:', process.env.ROUTESTAR_BASE_URL ? '✓ SET' : '✗ MISSING');
console.log('  USERNAME:', process.env.ROUTESTAR_USERNAME ? '✓ SET' : '✗ MISSING');
console.log('  PASSWORD:', process.env.ROUTESTAR_PASSWORD ? '✓ SET (hidden)' : '✗ MISSING');

console.log('\nBrowser:');
console.log('  HEADLESS:', process.env.HEADLESS || 'true (default)');

if (!process.env.CUSTOMERCONNECT_BASE_URL || !process.env.ROUTESTAR_BASE_URL) {
  console.log('\n❌ ERROR: Missing required environment variables!');
  console.log('Please check your .env file.');
  process.exit(1);
}

console.log('\n✅ All environment variables configured!');
"
```

## Running Tests with Visible Browser

To see what's happening during the test (helpful for debugging):

```bash
# Set HEADLESS=false temporarily
HEADLESS=false npm run test:customerconnect
```

Or update your `.env` file:
```env
HEADLESS=false
```

## Common Issues

### 1. Selector Not Found
If you see errors like "waiting for locator('#input-email') to be visible":
- The website structure may have changed
- Run with `HEADLESS=false` to see the actual page
- Check if there's a captcha or login redirect

### 2. Login Configuration Missing
If you see "Login configuration missing":
- Verify .env file exists in project root
- Check environment variable names match exactly
- Restart any running processes to pick up .env changes

### 3. Timeout Errors
If you see timeout errors:
- Check your internet connection
- Verify the URLs in .env are correct
- The website might be down or slow

## Test Commands

```bash
# Run all tests
npm run test:all

# Run individual tests
npm run test:customerconnect
npm run test:customerconnect-sync
npm run test:routestar
npm run test:routestar-sync
npm run test:closedinvoices
npm run test:scheduler
```

## What Tests Do

- **test:customerconnect** - Tests logging in and fetching orders from CustomerConnect
- **test:routestar** - Tests logging in and fetching invoices from RouteStar
- **test:*-sync** - Tests the database sync services
- **test:scheduler** - Tests the automated scheduler

## Requirements

1. Valid credentials in `.env` file
2. Network access to the portal websites
3. Playwright installed (`npm install`)
4. MongoDB running (for sync tests)
