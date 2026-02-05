# BaseAutomation Login Fix

## Issues Fixed

### 1. Config Structure Mismatch
**Problem:** BaseAutomation.login() expected:
- `config.loginUrl` (single property)
- `config.selectors.login.*`

**Actual Structure:**
- `config.baseUrl` + `config.routes.login` (two properties)
- Selectors in separate files (not in config)

### 2. Missing Selector Fields
**Problem:** Selectors were missing required fields:
- `cookieAcceptButton`
- `loggedInIndicator`
- `usernameInput` / `passwordInput` (aliases)

### 3. Missing isLoggedIn Property
**Problem:** BaseAutomation didn't track login state

## Solutions Applied

### 1. Updated BaseAutomation Constructor
Added missing properties:
```javascript
constructor(config) {
  this.config = config;
  this.browser = null;
  this.context = null;
  this.page = null;
  this.isInitialized = false;
  this.isLoggedIn = false;      // ✨ ADDED
  this.selectors = null;         // ✨ ADDED - Set by child class
}
```

### 2. Rewrote BaseAutomation.login()
Updated to work with our config structure:

**Before:**
```javascript
async login() {
  if (!this.config.loginUrl || !this.config.credentials) {
    throw new Error('Login configuration missing');
  }

  await this.page.goto(this.config.loginUrl);
  await this.page.fill(this.config.selectors.login.username, ...);
  // ...
}
```

**After:**
```javascript
async login() {
  // Validate config
  if (!this.config.baseUrl || !this.config.routes || !this.config.credentials) {
    throw new Error('Login configuration missing');
  }

  if (!this.selectors || !this.selectors.login) {
    throw new Error('Login selectors not configured');
  }

  // Construct login URL from baseUrl + routes.login
  const loginUrl = this.config.baseUrl + this.config.routes.login;

  // Use selectors from this.selectors (set by child class)
  const usernameSelector = this.selectors.login.usernameInput || this.selectors.login.username;
  const passwordSelector = this.selectors.login.passwordInput || this.selectors.login.password;

  // Handle cookie consent
  // Fill credentials
  // Verify login
  // Set this.isLoggedIn = true
}
```

**Key Changes:**
- ✅ Constructs `loginUrl` from `baseUrl + routes.login`
- ✅ Uses `this.selectors` instead of `this.config.selectors`
- ✅ Supports both `username` and `usernameInput` selector names
- ✅ Handles cookie consent dialog
- ✅ Sets `this.isLoggedIn` flag
- ✅ Takes screenshot on error

### 3. Updated Selectors Files

**CustomerConnect Selectors:**
```javascript
login: {
  username: '#input-email',
  usernameInput: '#input-email',              // ✨ ADDED (alias)
  password: '#input-password',
  passwordInput: '#input-password',            // ✨ ADDED (alias)
  submitButton: 'button[type="submit"]',
  errorMessage: '.alert-danger',
  cookieAcceptButton: 'button:has-text("Accept"), button:has-text("I Agree")',  // ✨ ADDED
  loggedInIndicator: 'a:has-text("logout"), a[href*="logout"]'                  // ✨ ADDED
}
```

**RouteStar Selectors:**
```javascript
login: {
  username: '#user',
  usernameInput: '#username',                  // ✨ ADDED (alias)
  password: '#pass',
  passwordInput: '#password',                  // ✨ ADDED (alias)
  submitButton: 'button[name="login"]',
  errorMessage: '.error, .alert-danger',
  cookieAcceptButton: 'button:has-text("Accept"), button:has-text("I Agree")',  // ✨ ADDED
  loggedInIndicator: 'a:has-text("Logout"), .user-menu, nav.main-nav'           // ✨ ADDED
}
```

## Files Modified

| File | Changes |
|------|---------|
| `src/automation/base/BaseAutomation.js` | Added `isLoggedIn` and `selectors` properties, rewrote `login()` method |
| `src/automation/selectors/customerconnect.selectors.js` | Added 4 missing selector fields |
| `src/automation/selectors/routestar.selectors.js` | Added 4 missing selector fields |

## How It Works Now

### 1. Child Class Sets Selectors
```javascript
class CustomerConnectAutomation extends BaseAutomation {
  constructor() {
    super(config);
    this.selectors = selectors;  // ✨ Set selectors from separate file
  }
}
```

### 2. BaseAutomation Uses Selectors
```javascript
// In BaseAutomation.login()
const usernameSelector = this.selectors.login.username;
const loginUrl = this.config.baseUrl + this.config.routes.login;
```

### 3. Login Flow
```
1. Construct login URL from baseUrl + routes.login
2. Navigate to login page
3. Handle cookie consent (if present)
4. Wait for login form
5. Fill username and password
6. Click submit button
7. Wait for page load
8. Check for error messages
9. Verify login success (child class method)
10. Set isLoggedIn = true
```

## Verification

All components verified:
```
✅ Config loaded
  - baseUrl: ✓
  - routes.login: ✓
  - credentials: ✓
✅ Selectors loaded
  - login.username: ✓
  - login.password: ✓
  - login.submitButton: ✓
  - login.cookieAcceptButton: ✓
  - login.loggedInIndicator: ✓
✅ All configuration ready!
```

## Status

✅ **BaseAutomation Fixed**
✅ **Config Structure Compatible**
✅ **All Selectors Added**
✅ **Ready for Testing**

---

**Fixed by:** Claude Sonnet 4.5
**Date:** 2026-02-05
**Files Modified:** 3 files
