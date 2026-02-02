# Email Service - Files Summary

This document provides an overview of all email service files and their purposes.

## File Structure

```
server/
├── src/
│   ├── utils/
│   │   ├── emailService.js              # Main email service (CORE)
│   │   ├── testEmailService.js          # Email testing utilities
│   │   ├── emailServiceExamples.js      # Integration examples
│   │   ├── emailServiceQuickRef.js      # Quick reference guide
│   │   ├── EMAIL_SERVICE_README.md      # Complete documentation
│   │   ├── EMAIL_SETUP_GUIDE.md         # Setup instructions
│   │   └── EMAIL_FILES_SUMMARY.md       # This file
│   └── templates/
│       └── emails/
│           ├── invoice.html             # Invoice email template
│           ├── lowStock.html            # Low stock alert template
│           ├── welcome.html             # Welcome email template
│           └── passwordReset.html       # Password reset template
├── .env.example                         # Updated with email config
└── package.json                         # Updated with test script
```

## Core Files

### 1. emailService.js
**Purpose:** Main email service utility

**Key Features:**
- Multi-provider support (Gmail, SendGrid, SMTP)
- Automatic retry logic (3 attempts)
- Email queue for bulk operations
- Template loading and placeholder replacement
- Error handling and logging

**Main Functions:**
- `initialize()` - Initialize email service
- `sendInvoiceEmail(invoice, email, pdfBuffer)` - Send invoice with PDF
- `sendLowStockAlert(items, email)` - Send low stock alerts
- `sendWelcomeEmail(user, password)` - Send welcome email
- `sendPasswordResetEmail(user, password)` - Send password reset
- `sendCustomEmail(to, subject, html, attachments)` - Send custom email
- `addToQueue(mailOptions)` - Add email to queue
- `testConnection()` - Test email configuration

**Usage:**
```javascript
const emailService = require('./utils/emailService');
await emailService.sendWelcomeEmail(user, tempPassword);
```

---

## Email Templates

### 2. invoice.html
**Purpose:** Professional invoice email template

**Placeholders:**
- `{{customerName}}` - Customer name
- `{{invoiceNumber}}` - Invoice number
- `{{invoiceDate}}` - Invoice date
- `{{totalAmount}}` - Total amount
- `{{currency}}` - Currency code
- `{{companyName}}` - Company name
- `{{companyEmail}}` - Company email
- `{{companyPhone}}` - Company phone
- `{{year}}` - Current year

**Features:**
- Professional gradient header
- Invoice details box
- PDF attachment notice
- Responsive design
- Company branding

---

### 3. lowStock.html
**Purpose:** Low stock alert email template

**Placeholders:**
- `{{itemCount}}` - Number of low stock items
- `{{itemsTable}}` - HTML table rows of items
- `{{alertDate}}` - Alert date
- `{{alertTime}}` - Alert time
- `{{companyName}}` - Company name
- `{{dashboardUrl}}` - Dashboard URL
- `{{year}}` - Current year

**Features:**
- Warning theme (orange/red gradient)
- Item details table
- Recommended actions list
- Call-to-action button
- Responsive design

---

### 4. welcome.html
**Purpose:** New user welcome email template

**Placeholders:**
- `{{fullName}}` - User's full name
- `{{username}}` - Username
- `{{email}}` - User email
- `{{temporaryPassword}}` - Temporary password
- `{{role}}` - User role
- `{{loginUrl}}` - Login page URL
- `{{companyName}}` - Company name
- `{{supportEmail}}` - Support email
- `{{year}}` - Current year

**Features:**
- Welcoming green theme
- Account details box
- Security notice
- Getting started instructions
- Login button
- Support information

---

### 5. passwordReset.html
**Purpose:** Password reset notification template

**Placeholders:**
- `{{fullName}}` - User's full name
- `{{username}}` - Username
- `{{newPassword}}` - New temporary password
- `{{resetDate}}` - Reset date and time
- `{{loginUrl}}` - Login page URL
- `{{companyName}}` - Company name
- `{{supportEmail}}` - Support email
- `{{year}}` - Current year

**Features:**
- Security-focused blue theme
- Reset details box
- Security warnings
- Password best practices
- Next steps instructions
- Login button

---

## Documentation Files

### 6. EMAIL_SERVICE_README.md
**Purpose:** Complete API documentation

**Contents:**
- Detailed API reference
- All function signatures
- Configuration options
- Integration examples
- Error handling
- Performance tips
- Security best practices
- Troubleshooting guide

**Use this for:** Understanding the complete API

---

### 7. EMAIL_SETUP_GUIDE.md
**Purpose:** Step-by-step setup instructions

**Contents:**
- Prerequisites
- Installation steps
- Gmail configuration guide
- SendGrid configuration guide
- SMTP configuration guide
- Testing procedures
- Integration examples
- Troubleshooting
- Security best practices

**Use this for:** Initial setup and configuration

---

## Helper Files

### 8. testEmailService.js
**Purpose:** Comprehensive testing utilities

**Features:**
- Test connection
- Test all email types
- Automatic test suite
- Success/failure reporting
- Can run standalone or import functions

**Usage:**
```bash
# Run all tests
npm run test:email

# Run programmatically
node src/utils/testEmailService.js
```

**Test Functions:**
- `testConnection()` - Test email service
- `testWelcomeEmail()` - Test welcome email
- `testPasswordResetEmail()` - Test password reset
- `testLowStockAlert()` - Test low stock alert
- `testInvoiceEmail()` - Test invoice email
- `testCustomEmail()` - Test custom email
- `runAllTests()` - Run complete test suite

---

### 9. emailServiceExamples.js
**Purpose:** Real-world integration examples

**Contents:**
- User registration with email
- Password reset workflow
- Low stock checking
- Invoice generation
- Bulk notifications
- Scheduled tasks setup
- Health check endpoints
- Test email endpoints

**Use this for:** Learning how to integrate email service into your application

**Example Functions:**
- `createUserWithEmail(req, res)` - Create user + send welcome
- `resetPasswordWithEmail(req, res)` - Reset password + send email
- `checkAndAlertLowStock()` - Check and alert low stock
- `generateAndEmailInvoice(req, res)` - Generate invoice PDF + email
- `sendBulkNotifications(req, res)` - Send bulk emails
- `initializeScheduledEmails()` - Setup cron jobs
- `checkEmailHealth(req, res)` - Health check endpoint
- `sendTestEmail(req, res)` - Test email endpoint

---

### 10. emailServiceQuickRef.js
**Purpose:** Quick reference for common operations

**Contents:**
- Common email patterns
- Quick function wrappers
- Error handling examples
- Testing shortcuts
- Environment variable reference
- Command reference

**Use this for:** Quick copy-paste solutions

---

## Configuration Files

### 11. .env.example
**Updated sections:**
```env
# Email Configuration
EMAIL_PROVIDER=smtp|gmail|sendgrid

# Gmail Settings
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# SendGrid Settings
SENDGRID_API_KEY=SG.xxxxx...

# SMTP Settings
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASSWORD=your-password

# General Email Settings
EMAIL_FROM=noreply@yourcompany.com
COMPANY_NAME=Your Company Name
COMPANY_EMAIL=support@yourcompany.com
COMPANY_PHONE=+1-234-567-8900
SUPPORT_EMAIL=support@yourcompany.com
TEST_EMAIL=test@example.com
```

---

### 12. package.json
**Updated sections:**
```json
{
  "scripts": {
    "test:email": "node src/utils/testEmailService.js"
  },
  "dependencies": {
    "nodemailer": "^6.9.15"
  }
}
```

---

## Quick Start Workflow

1. **Setup:**
   - Read `EMAIL_SETUP_GUIDE.md`
   - Configure `.env` file
   - Run `npm run test:email`

2. **Development:**
   - Use `emailServiceExamples.js` for patterns
   - Refer to `emailServiceQuickRef.js` for quick snippets
   - Check `EMAIL_SERVICE_README.md` for API details

3. **Integration:**
   - Import `emailService.js` in your controllers
   - Copy patterns from `emailServiceExamples.js`
   - Test using `testEmailService.js`

4. **Customization:**
   - Edit templates in `templates/emails/`
   - Keep `{{placeholder}}` syntax
   - Test changes with `npm run test:email`

---

## File Dependencies

```
emailService.js (CORE)
├── Uses: nodemailer
├── Reads: templates/emails/*.html
└── Required by:
    ├── testEmailService.js
    ├── emailServiceExamples.js
    └── emailServiceQuickRef.js

Templates (invoice.html, lowStock.html, welcome.html, passwordReset.html)
├── Used by: emailService.js
└── Format: HTML with {{placeholders}}

Documentation (*.md files)
└── Reference only, no code dependencies
```

---

## NPM Scripts

```bash
# Test email service
npm run test:email

# Run server (will initialize email service)
npm start

# Development mode
npm run dev
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| EMAIL_PROVIDER | Yes | smtp | Email provider: smtp, gmail, sendgrid |
| GMAIL_USER | If Gmail | - | Gmail email address |
| GMAIL_APP_PASSWORD | If Gmail | - | Gmail app password (16 chars) |
| SENDGRID_API_KEY | If SendGrid | - | SendGrid API key |
| SMTP_HOST | If SMTP | smtp.gmail.com | SMTP server host |
| SMTP_PORT | If SMTP | 587 | SMTP server port |
| SMTP_SECURE | If SMTP | false | Use SSL/TLS |
| SMTP_USER | If SMTP | - | SMTP username |
| SMTP_PASSWORD | If SMTP | - | SMTP password |
| EMAIL_FROM | Yes | - | Default sender email |
| COMPANY_NAME | No | Inventory System | Company name for emails |
| COMPANY_EMAIL | No | - | Company contact email |
| COMPANY_PHONE | No | - | Company phone number |
| SUPPORT_EMAIL | No | - | Support email address |
| CLIENT_URL | Yes | http://localhost:3000 | Frontend URL |
| TEST_EMAIL | Testing only | - | Email for testing |

---

## Common Use Cases

### Use Case 1: Send Welcome Email
```javascript
const emailService = require('./utils/emailService');
const user = { fullName: 'John', username: 'john', email: 'john@example.com', role: 'employee' };
await emailService.sendWelcomeEmail(user, 'TempPass123');
```

### Use Case 2: Check Low Stock Daily
```javascript
const cron = require('node-cron');
cron.schedule('0 9 * * *', async () => {
  const lowItems = await Inventory.find({ /* low stock query */ });
  const admins = await User.find({ role: 'admin' });
  for (const admin of admins) {
    await emailService.sendLowStockAlert(lowItems, admin.email);
  }
});
```

### Use Case 3: Send Invoice
```javascript
const invoice = { invoiceNumber: 'INV-001', customerName: 'Jane', totalAmount: 1000 };
const pdfBuffer = generatePDF(invoice);
await emailService.sendInvoiceEmail(invoice, 'customer@example.com', pdfBuffer);
```

---

## Support

For questions or issues:
1. Check `EMAIL_SETUP_GUIDE.md` troubleshooting section
2. Review `EMAIL_SERVICE_README.md` for API details
3. Run `npm run test:email` to diagnose issues
4. Check environment variables are set correctly

---

## Version Info

- Created: 2026-02-01
- Email Service Version: 1.0.0
- Nodemailer Version: ^6.9.15
- Node.js Required: >=14.0.0

---

## License

Part of Inventory Management System
