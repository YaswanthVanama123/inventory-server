# Professional Automation Architecture

## Overview
This folder contains a professional, reusable automation architecture following SOLID principles and clean code practices.

## Directory Structure

```
src/automation/
├── base/                           # Base classes
│   └── BaseAutomation.js          # Abstract base class with common functionality
│
├── config/                        # Configuration files
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
├── fetchers/                      # Data fetching logic
│   ├── CustomerConnectFetcher.js # Fetch CustomerConnect orders
│   └── RouteStarFetcher.js       # Fetch RouteStar invoices
│
├── utils/                         # Utility helpers
│   ├── RetryHandler.js           # Retry logic with exponential backoff
│   └── Logger.js                 # Consistent logging
│
├── customerconnect.js            # Main CustomerConnect automation (refactored)
├── routestar.js                  # Main RouteStar automation (refactored)
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

### Basic Usage

```javascript
const { CustomerConnectAutomation } = require('./automation');

const automation = new CustomerConnectAutomation();
await automation.init();
await automation.login();

const orders = await automation.fetchOrdersList();
await automation.close();
```

### Using Individual Components

```javascript
const { CustomerConnectFetcher, CustomerConnectNavigator } = require('./automation');

// Create instances
const navigator = new CustomerConnectNavigator(page);
const fetcher = new CustomerConnectFetcher(page, navigator, selectors);

// Use them
await fetcher.fetchOrders(100);
```

### With Retry Logic

```javascript
const { RetryHandler } = require('./automation');

const result = await RetryHandler.execute(
  async () => await automation.fetchOrdersList(),
  {
    maxAttempts: 3,
    delay: 2000,
    backoff: true,
    onRetry: (attempt, error) => {
      console.log(`Retry attempt ${attempt}: ${error.message}`);
    }
  }
);
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

# Browser
HEADLESS=true
```

### Modifying Configuration
Edit the config files to change:
- Routes and URLs
- Pagination settings
- Timeouts
- Retry behavior

## Extending the Architecture

### Adding a New Portal

1. Create configuration: `config/newportal.config.js`
2. Create selectors: `selectors/newportal.selectors.js`
3. Create parser: `parsers/newportal.parser.js`
4. Create navigator: `navigators/newportal.navigator.js`
5. Create fetcher: `fetchers/NewPortalFetcher.js`
6. Create main class extending `BaseAutomation`
7. Export from `index.js`

### Adding New Functionality

Extend the base class or create new utility classes in the `utils/` folder.

## Best Practices

1. **Always use the base class** - Inherit from `BaseAutomation` for new automations
2. **Externalize selectors** - Never hardcode CSS selectors in logic files
3. **Use parsers** - Keep data extraction separate from fetching
4. **Handle errors gracefully** - Use retry logic and provide meaningful error messages
5. **Log appropriately** - Use the Logger utility for consistent logging
6. **Test components** - Write unit tests for parsers, navigators, and fetchers

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
