# Professional Automation Architecture

## Overview
This folder contains a professional, reusable automation architecture following SOLID principles and clean code practices. Built with Playwright for robust web scraping and browser automation.

## Directory Structure

```
src/automation/
├── core/                          # Core base classes
│   ├── BaseBrowser.js            # Browser lifecycle management
│   ├── BasePage.js               # Common page interactions
│   ├── BaseNavigator.js          # Navigation patterns
│   └── BaseParser.js             # Data extraction patterns
│
├── config/                        # Configuration files
│   ├── browser.config.js         # Browser settings
│   ├── timeout.config.js         # Timeout configurations
│   ├── customerconnect.config.js # CustomerConnect portal configuration
│   └── routestar.config.js       # RouteStar portal configuration
│
├── selectors/                     # CSS Selectors
│   ├── customerconnect.selectors.js # CustomerConnect CSS selectors
│   └── routestar.selectors.js      # RouteStar CSS selectors
│
├── parsers/                       # Data parsers
│   ├── customerconnect.parser.js # Parse CustomerConnect data
│   └── routestar.parser.js       # Parse RouteStar data
│
├── navigators/                    # Navigation logic
│   ├── customerconnect.navigator.js # CustomerConnect navigation
│   └── routestar.navigator.js      # RouteStar navigation
│
├── services/                      # High-level orchestration
│   ├── CustomerConnectService.js # CustomerConnect automation service
│   └── RouteStarService.js       # RouteStar automation service
│
├── utils/                         # Utility helpers
│   ├── logger.js                 # Winston-based structured logging
│   ├── retry.js                  # Retry logic with exponential backoff
│   ├── wait.js                   # Wait strategies
│   └── screenshot.js             # Screenshot utilities
│
├── errors/                        # Custom error classes
│   ├── AutomationError.js        # Base error class
│   ├── LoginError.js             # Login failures
│   ├── NavigationError.js        # Navigation failures
│   ├── ParsingError.js           # Data parsing failures
│   ├── ElementNotFoundError.js   # Element not found
│   ├── TimeoutError.js           # Timeout errors
│   └── index.js                  # Error exports
│
├── customerconnect.js            # Main CustomerConnect automation
├── routestar.js                  # Main RouteStar automation
└── index.js                      # Central export point
```

## Architecture Principles

### 1. **Separation of Concerns**
- Each class has a single, well-defined responsibility
- Navigation, parsing, and fetching are separated
- Configuration is externalized

### 2. **Reusability**
- Base class provides common functionality
- Parsers can be used independently
- Utilities are shared across all automation

### 3. **Maintainability**
- Selectors are centralized and easy to update
- Configuration changes don't require code changes
- Clear naming conventions

### 4. **Testability**
- Each component can be tested independently
- Dependencies can be mocked
- Clear interfaces

### 5. **Error Handling**
- Retry logic with exponential backoff
- Graceful degradation
- Detailed error messages

## Usage Examples

### Basic Service Usage

```javascript
const CustomerConnectService = require('./automation/services/CustomerConnectService');

const service = new CustomerConnectService();
await service.initialize();
await service.login({
  username: 'your-username',
  password: 'your-password'
});

const orders = await service.fetchOrders();
await service.cleanup();
```

### Using Core Components

```javascript
const BaseBrowser = require('./automation/core/BaseBrowser');
const BaseNavigator = require('./automation/core/BaseNavigator');
const BaseParser = require('./automation/core/BaseParser');

// Initialize browser
const browser = new BaseBrowser();
await browser.launch('chromium');
const page = await browser.createPage();

// Navigate and interact
const navigator = new BaseNavigator(page);
await navigator.login(credentials, selectors, successUrl);

// Extract data
const data = await BaseParser.parseTableWithHeaders(page, selectors);

// Cleanup
await browser.close();
```

### Pagination Example

```javascript
const navigator = new BaseNavigator(page);

const allData = await navigator.paginate(
  async (page) => {
    // Extract data from current page
    return await BaseParser.parseTable(page, selectors);
  },
  { nextButton: '.pagination-next' },
  { maxPages: 10, stopOnEmpty: true }
);
```

### With Retry Logic

```javascript
const { retry } = require('./automation/utils/retry');

const result = await retry(
  async () => await service.fetchOrders(),
  {
    attempts: 3,
    delay: 2000,
    backoff: true,
    onRetry: (attempt, error) => {
      console.log(`Retry attempt ${attempt}: ${error.message}`);
    }
  }
);
```

### Error Handling

```javascript
const { LoginError, ParsingError } = require('./automation/errors');

try {
  await navigator.login(credentials, selectors, successUrl);
} catch (error) {
  if (error instanceof LoginError) {
    console.error('Login failed:', error.username, error.url);
  } else if (error instanceof ParsingError) {
    console.error('Parsing failed:', error.selector, error.dataType);
  }
  throw error;
}
```

## Configuration

### Environment Variables
All sensitive configuration is loaded from environment variables:

```env
# CustomerConnect
CUSTOMERCONNECT_BASE_URL=https://envirostore.mycustomerconnect.com
CUSTOMERCONNECT_USERNAME=your-username
CUSTOMERCONNECT_PASSWORD=your-password

# RouteStar
ROUTESTAR_BASE_URL=https://emnrv.routestar.online
ROUTESTAR_USERNAME=your-username
ROUTESTAR_PASSWORD=your-password

# Browser Configuration
HEADLESS=true
VIEWPORT_WIDTH=1920
VIEWPORT_HEIGHT=1080
DEFAULT_TIMEOUT=30000
SLOW_MO=0

# Timeout Configuration
NAVIGATION_TIMEOUT=30000
ELEMENT_TIMEOUT=10000
NETWORK_TIMEOUT=15000
SCREENSHOT_TIMEOUT=5000

# Retry Configuration
RETRY_ATTEMPTS=3
RETRY_DELAY=2000
RETRY_BACKOFF=true
```

### Modifying Configuration
Edit the config files to change:
- Routes and URLs
- Pagination settings
- Timeouts
- Retry behavior

## Extending the Architecture

### Adding a New Portal

1. **Create configuration**: `config/newportal.config.js`
   ```javascript
   module.exports = {
     baseUrl: process.env.NEWPORTAL_BASE_URL,
     routes: {
       login: '/login',
       orders: '/orders'
     },
     credentials: {
       username: process.env.NEWPORTAL_USERNAME,
       password: process.env.NEWPORTAL_PASSWORD
     }
   };
   ```

2. **Create selectors**: `selectors/newportal.selectors.js`
   ```javascript
   module.exports = {
     login: {
       usernameInput: '#username',
       passwordInput: '#password',
       submitButton: 'button[type="submit"]',
       errorMessage: '.error-message'
     },
     orders: {
       table: 'table.orders',
       rows: 'tbody tr',
       nextButton: '.pagination-next'
     }
   };
   ```

3. **Create navigator** (optional): `navigators/newportal.navigator.js`
   ```javascript
   const BaseNavigator = require('../core/BaseNavigator');
   const selectors = require('../selectors/newportal.selectors');
   const config = require('../config/newportal.config');

   class NewPortalNavigator extends BaseNavigator {
     async loginToPortal(credentials) {
       await this.navigateTo(config.baseUrl + config.routes.login);
       await this.login(credentials, selectors.login, config.routes.orders);
     }
   }

   module.exports = NewPortalNavigator;
   ```

4. **Create parser** (optional): `parsers/newportal.parser.js`
   ```javascript
   const BaseParser = require('../core/BaseParser');

   class NewPortalParser extends BaseParser {
     static async parseOrders(page, selectors) {
       return await this.parseTableWithHeaders(page, selectors.orders);
     }
   }

   module.exports = NewPortalParser;
   ```

5. **Create service**: `services/NewPortalService.js`
   ```javascript
   const BaseBrowser = require('../core/BaseBrowser');
   const NewPortalNavigator = require('../navigators/newportal.navigator');
   const NewPortalParser = require('../parsers/newportal.parser');
   const config = require('../config/newportal.config');
   const selectors = require('../selectors/newportal.selectors');
   const { retry } = require('../utils/retry');

   class NewPortalService {
     constructor() {
       this.browser = new BaseBrowser();
       this.navigator = null;
     }

     async initialize() {
       await this.browser.launch('chromium');
       const page = await this.browser.createPage();
       this.navigator = new NewPortalNavigator(page);
     }

     async login() {
       await this.navigator.loginToPortal(config.credentials);
     }

     async fetchOrders() {
       return await retry(async () => {
         await this.navigator.navigateTo(config.baseUrl + config.routes.orders);
         return await NewPortalParser.parseOrders(this.navigator.page, selectors);
       });
     }

     async cleanup() {
       await this.browser.close();
     }
   }

   module.exports = NewPortalService;
   ```

6. **Export from** `index.js`

### Adding New Functionality

Extend the base class or create new utility classes in the `utils/` folder.

## Best Practices

1. **Leverage core classes** - Use BaseBrowser, BasePage, BaseNavigator, and BaseParser
2. **Externalize selectors** - Never hardcode CSS selectors in logic files
3. **Separate concerns** - Keep navigation, parsing, and orchestration separate
4. **Handle errors gracefully** - Use custom error classes and retry logic
5. **Log appropriately** - Use the logger utility for structured logging
6. **Test components** - Write unit tests for parsers, navigators, and services
7. **Manage resources** - Always close browser instances in finally blocks
8. **Use environment variables** - Never hardcode credentials or configuration

## Performance Considerations

- Use pagination efficiently
- Implement rate limiting where needed
- Reuse browser instances
- Close resources properly

## Security

- Never commit credentials
- Use environment variables
- Sanitize logged data
- Use HTTPS only

## Maintenance

- Update selectors when portal UI changes
- Review retry logic and timeouts periodically
- Keep dependencies up to date
- Monitor for deprecated Playwright APIs
