# Test Configuration & Debugging Guide

## Quick Start

### 1. Verify Your Configuration

First, run the configuration verification script:

```bash
npm run test:verify
```

This will check:
- ✓ All environment variables are set
- ✓ Configs load correctly
- ✓ Selectors are defined
- ✓ Everything is ready for testing

### 2. Run Tests with Visible Browser

The tests are currently failing because they can't find the login form elements. To see what's actually happening:

```bash
# Run with visible browser to see what's happening
HEADLESS=false npm run test:customerconnect
```

Or permanently set in `.env`:
```env
HEADLESS=false
```

## Current Issue: Selector Timeouts

The tests are failing with:
```
❌ page.waitForSelector: Timeout 15000ms exceeded.
   waiting for locator('#input-email') to be visible
```

### Possible Causes:

1. **Website Changed Structure**
   - The CSS selectors in `src/automation/selectors/*.js` may be outdated
   - Run with `HEADLESS=false` to inspect the actual page

2. **Captcha or Security Challenge**
   - The website may show a captcha or security check
   - Run with `HEADLESS=false` to see if there's a challenge

3. **Different Page Loaded**
   - The website may redirect to a different page
   - Check if URL is correct in `.env`

4. **Slow Page Load**
   - The page may take longer than 15 seconds to load
   - Check your internet connection

## Debugging Steps

### Step 1: Run Configuration Verification
```bash
npm run test:verify
```

Expected output:
```
✅ Configuration is valid!
```

### Step 2: Run Test with Visible Browser
```bash
HEADLESS=false npm run test:customerconnect
```

Watch what happens:
- Does the page load?
- What does the page look like?
- Is there a login form?
- What are the actual input field IDs?

### Step 3: Update Selectors If Needed

If the page structure is different, update the selectors in:
- `src/automation/selectors/customerconnect.selectors.js`
- `src/automation/selectors/routestar.selectors.js`

For example, if the username field is `#email` instead of `#input-email`:

```javascript
// src/automation/selectors/customerconnect.selectors.js
module.exports = {
  login: {
    username: '#email',        // ← Update this
    usernameInput: '#email',   // ← Update this
    password: '#input-password',
    // ...
  }
};
```

### Step 4: Check Screenshots

The automation takes screenshots on errors. Check:
```
uploads/screenshots/login-error-*.png
```

These show what the page looked like when the error occurred.

## Environment Variables Required

Make sure these are set in your `.env` file:

```env
# CustomerConnect
CUSTOMERCONNECT_BASE_URL=https://envirostore.mycustomerconnect.com
CUSTOMERCONNECT_USERNAME=your-username
CUSTOMERCONNECT_PASSWORD=your-password

# RouteStar
ROUTESTAR_BASE_URL=https://emnrv.routestar.online
ROUTESTAR_USERNAME=your-username
ROUTESTAR_PASSWORD=your-password

# Browser
HEADLESS=false  # Set to false for debugging
```

## Test Commands

```bash
# Verify configuration
npm run test:verify

# Run individual tests
npm run test:customerconnect
npm run test:routestar

# Run sync tests (requires MongoDB)
npm run test:customerconnect-sync
npm run test:routestar-sync

# Run all tests
npm run test:all
```

## Common Fixes

### Fix 1: Update Selectors

Inspect the actual login page HTML and update selectors:

```bash
# Run with visible browser
HEADLESS=false npm run test:customerconnect

# Then inspect the page and find the actual selectors
# Update src/automation/selectors/customerconnect.selectors.js
```

### Fix 2: Increase Timeout

If the page is just slow, increase the timeout in `BaseAutomation.js`:

```javascript
await this.page.waitForSelector(usernameSelector, {
  timeout: 30000,  // Increase from 15000 to 30000
  state: 'visible'
});
```

### Fix 3: Check Network

Make sure you can access the websites:

```bash
curl https://envirostore.mycustomerconnect.com
curl https://emnrv.routestar.online
```

## Next Steps

1. Run `npm run test:verify` to check configuration
2. Run with `HEADLESS=false` to see what's happening
3. Check the actual page selectors using browser dev tools
4. Update selectors if needed
5. Check screenshots in `uploads/screenshots/` for errors

## Need Help?

If you're still having issues:

1. Check the error screenshots: `uploads/screenshots/`
2. Run with visible browser: `HEADLESS=false npm run test:*`
3. Verify credentials are correct in `.env`
4. Check if websites are accessible from your network
5. Look at the test logs for specific error messages

---

**Files Created:**
- `tests/README.md` - This guide
- `tests/verify-config.js` - Configuration verification script

**Test Documentation:** `/tests/README.md`
**Configuration Docs:** `/docs/TEST_ENV_PATH_FIX.md`
