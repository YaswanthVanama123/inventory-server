# Email Service Setup Guide

## Quick Start

This guide will help you set up and configure the email service for your inventory management system.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Testing](#testing)
5. [Integration](#integration)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Node.js installed
- Access to an email service provider (Gmail, SendGrid, or SMTP server)
- Basic knowledge of environment variables

---

## Installation

### Step 1: Install Dependencies

The required dependency `nodemailer` is already included in package.json. If you need to install it manually:

```bash
cd server
npm install nodemailer
```

### Step 2: Verify Files

Ensure the following files exist:

```
server/src/
├── utils/
│   ├── emailService.js                 # Main email service
│   ├── testEmailService.js             # Testing utilities
│   ├── emailServiceExamples.js         # Integration examples
│   └── EMAIL_SERVICE_README.md         # Full documentation
└── templates/
    └── emails/
        ├── invoice.html                # Invoice email template
        ├── lowStock.html               # Low stock alert template
        ├── welcome.html                # Welcome email template
        └── passwordReset.html          # Password reset template
```

---

## Configuration

### Option 1: Gmail (Recommended for Development)

**Step 1: Enable 2-Step Verification**
1. Go to your Google Account: https://myaccount.google.com
2. Navigate to Security
3. Enable 2-Step Verification

**Step 2: Generate App Password**
1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" and "Other (Custom name)"
3. Enter a name like "Inventory System"
4. Click "Generate"
5. Copy the 16-character password

**Step 3: Update .env File**

```env
# Email Configuration
EMAIL_PROVIDER=gmail

# Gmail Settings
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

# General Email Settings
EMAIL_FROM=your-email@gmail.com
COMPANY_NAME=Your Company Name
COMPANY_EMAIL=support@yourcompany.com
COMPANY_PHONE=+1-234-567-8900
SUPPORT_EMAIL=support@yourcompany.com
CLIENT_URL=http://localhost:3000

# Test Email (for testing)
TEST_EMAIL=your-email@gmail.com
```

**Important Notes:**
- Use the App Password, NOT your regular Gmail password
- Remove spaces from the app password when entering it
- The Gmail account must have 2-Step Verification enabled

---

### Option 2: SendGrid (Recommended for Production)

**Step 1: Create SendGrid Account**
1. Sign up at: https://sendgrid.com
2. Verify your email address
3. Complete the sender verification process

**Step 2: Create API Key**
1. Go to Settings > API Keys
2. Click "Create API Key"
3. Name it (e.g., "Inventory System")
4. Select "Full Access" or "Restricted Access" with Mail Send permissions
5. Copy the API key (you won't be able to see it again)

**Step 3: Verify Sender**
1. Go to Settings > Sender Authentication
2. Verify a single sender email address
3. Check your email and click the verification link

**Step 4: Update .env File**

```env
# Email Configuration
EMAIL_PROVIDER=sendgrid

# SendGrid Settings
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# General Email Settings
EMAIL_FROM=verified-email@yourdomain.com
COMPANY_NAME=Your Company Name
COMPANY_EMAIL=support@yourdomain.com
COMPANY_PHONE=+1-234-567-8900
SUPPORT_EMAIL=support@yourdomain.com
CLIENT_URL=https://your-production-url.com

# Test Email
TEST_EMAIL=your-email@example.com
```

**Important Notes:**
- EMAIL_FROM must be a verified sender email
- For production, verify your domain (not just single sender)
- Keep your API key secret and never commit it to version control

---

### Option 3: Custom SMTP Server

**Update .env File**

```env
# Email Configuration
EMAIL_PROVIDER=smtp

# SMTP Settings
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASSWORD=your-password
SMTP_TLS_REJECT_UNAUTHORIZED=true

# General Email Settings
EMAIL_FROM=noreply@yourdomain.com
COMPANY_NAME=Your Company Name
COMPANY_EMAIL=support@yourdomain.com
COMPANY_PHONE=+1-234-567-8900
SUPPORT_EMAIL=support@yourdomain.com
CLIENT_URL=http://localhost:3000

# Test Email
TEST_EMAIL=your-email@example.com
```

**Common SMTP Configurations:**

| Provider        | Host                  | Port | Secure |
|-----------------|----------------------|------|--------|
| Gmail           | smtp.gmail.com       | 587  | false  |
| Outlook         | smtp-mail.outlook.com| 587  | false  |
| Yahoo           | smtp.mail.yahoo.com  | 587  | false  |
| Mail.com        | smtp.mail.com        | 587  | false  |
| Custom          | smtp.yourdomain.com  | 587  | false  |

---

## Testing

### Step 1: Test Email Configuration

Run the test suite to verify your email configuration:

```bash
# From the server directory
npm run test:email
```

This will:
1. Test the email service connection
2. Send sample emails of each type to TEST_EMAIL
3. Display results for each test

### Step 2: Test Individual Email Types

You can also test individual email functions programmatically:

```javascript
// Create a test file: server/test-my-email.js
const emailService = require('./src/utils/emailService');
require('dotenv').config();

async function test() {
  // Test connection
  const result = await emailService.testConnection();
  console.log('Connection:', result);

  // Send test welcome email
  const user = {
    fullName: 'Test User',
    username: 'testuser',
    email: process.env.TEST_EMAIL,
    role: 'employee'
  };

  const welcomeResult = await emailService.sendWelcomeEmail(user, 'TempPass123');
  console.log('Welcome Email:', welcomeResult);
}

test();
```

Run it:
```bash
node test-my-email.js
```

### Step 3: Verify Email Delivery

Check your TEST_EMAIL inbox for:
- Welcome email with temporary password
- Password reset email
- Low stock alert (with sample items)
- Invoice email (with attachment)
- Custom test email

---

## Integration

### Initialize Email Service on Server Startup

**In your server.js file:**

```javascript
const express = require('express');
const emailService = require('./utils/emailService');

const app = express();

// ... other middleware ...

// Initialize email service when server starts
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Initialize email service
  const emailReady = await emailService.initialize();
  if (emailReady) {
    console.log('✅ Email service initialized successfully');
  } else {
    console.log('⚠️  Email service not configured (app will continue without email)');
  }
});
```

### Use in Controllers

**Example: User Creation**

```javascript
// controllers/userController.js
const User = require('../models/User');
const emailService = require('../utils/emailService');
const crypto = require('crypto');

exports.createUser = async (req, res) => {
  try {
    const { username, email, fullName, role } = req.body;

    // Generate temporary password
    const temporaryPassword = crypto.randomBytes(8).toString('hex');

    // Create user
    const user = await User.create({
      username,
      email,
      fullName,
      role,
      password: temporaryPassword,
      createdBy: req.user._id
    });

    // Send welcome email (async, don't wait)
    emailService.sendWelcomeEmail(user, temporaryPassword)
      .then(result => {
        if (result.success) {
          console.log(`Welcome email sent to ${user.email}`);
        }
      })
      .catch(error => {
        console.error('Email error:', error);
      });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
```

### Setup Scheduled Low Stock Alerts

**Option 1: Using node-cron**

```bash
npm install node-cron
```

```javascript
// server.js
const cron = require('node-cron');
const Inventory = require('./models/Inventory');
const User = require('./models/User');
const emailService = require('./utils/emailService');

// Schedule low stock check daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('Running scheduled low stock check...');

  const lowStockItems = await Inventory.find({
    $expr: { $lte: ['$quantity.current', '$quantity.minimum'] },
    isActive: true
  });

  if (lowStockItems.length > 0) {
    const admins = await User.find({ role: 'admin', isActive: true });

    for (const admin of admins) {
      await emailService.sendLowStockAlert(lowStockItems, admin.email);
    }

    console.log(`Low stock alert sent for ${lowStockItems.length} items`);
  }
});
```

**Option 2: Manual Trigger via API Endpoint**

```javascript
// routes/admin.js
router.post('/check-low-stock', auth, adminAuth, async (req, res) => {
  try {
    const lowStockItems = await Inventory.find({
      $expr: { $lte: ['$quantity.current', '$quantity.minimum'] },
      isActive: true
    });

    if (lowStockItems.length === 0) {
      return res.json({
        success: true,
        message: 'No low stock items found'
      });
    }

    const admins = await User.find({ role: 'admin', isActive: true });

    for (const admin of admins) {
      await emailService.sendLowStockAlert(lowStockItems, admin.email);
    }

    res.json({
      success: true,
      message: `Alert sent for ${lowStockItems.length} items to ${admins.length} admins`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
```

---

## Troubleshooting

### Problem: "Invalid login" error with Gmail

**Solution:**
- Make sure you're using an App Password, not your regular Gmail password
- Verify that 2-Step Verification is enabled
- Check that the app password is entered correctly (remove spaces)

### Problem: Connection timeout

**Solution:**
- Check your firewall settings
- Verify SMTP port (587 for TLS, 465 for SSL)
- Check SMTP_SECURE setting in .env
- Try different port (587 vs 465)

### Problem: "Sender address rejected" with SendGrid

**Solution:**
- Verify your sender email in SendGrid dashboard
- Make sure EMAIL_FROM matches verified sender
- For production, verify your domain

### Problem: Emails going to spam

**Solution:**
- Use a verified domain email address
- Set up SPF and DKIM records for your domain
- Avoid spam trigger words in subject lines
- Use professional email templates (already provided)

### Problem: "Module not found: nodemailer"

**Solution:**
```bash
cd server
npm install nodemailer
```

### Problem: Template not found error

**Solution:**
- Verify template files exist in `server/src/templates/emails/`
- Check file names match exactly (case-sensitive)
- Ensure templates have .html extension

### Problem: Rate limiting errors

**Solution:**
- Use email queue for bulk operations
- Add delays between emails
- Upgrade to higher tier with your email provider
- Use `addToQueue()` instead of direct `sendEmail()`

---

## Advanced Configuration

### Custom Email Templates

To create custom email templates:

1. Create a new HTML file in `server/src/templates/emails/`
2. Use `{{placeholder}}` syntax for dynamic content
3. Use the template in your code:

```javascript
const template = await emailService.loadTemplate('yourTemplate');
const html = emailService.replacePlaceholders(template, {
  name: 'John Doe',
  customField: 'value'
});

await emailService.sendCustomEmail(email, subject, html);
```

### Email Queue Configuration

Modify queue settings in emailService.js:

```javascript
this.maxRetries = 3;        // Number of retry attempts
this.retryDelay = 5000;     // Delay between retries (ms)
```

### Environment-Specific Configuration

Use different email providers for different environments:

```env
# Development
EMAIL_PROVIDER=gmail

# Production
EMAIL_PROVIDER=sendgrid
```

---

## Security Best Practices

1. **Never commit .env file** - Add to .gitignore
2. **Use App Passwords** - Not regular account passwords
3. **Enable TLS/SSL** - Always use secure connections
4. **Validate email addresses** - Before sending emails
5. **Rate limiting** - Use email queue for bulk operations
6. **Monitor usage** - Check for unusual email sending patterns
7. **Rotate credentials** - Periodically update API keys and passwords

---

## Support

For more information, refer to:
- Full documentation: `server/src/utils/EMAIL_SERVICE_README.md`
- Code examples: `server/src/utils/emailServiceExamples.js`
- Test utilities: `server/src/utils/testEmailService.js`

If you encounter issues:
1. Check the troubleshooting section above
2. Review the logs for error messages
3. Test your email configuration using `npm run test:email`
4. Verify all environment variables are set correctly

---

## Next Steps

1. ✅ Configure your .env file with email credentials
2. ✅ Run `npm run test:email` to verify setup
3. ✅ Integrate email service into your controllers
4. ✅ Set up scheduled low stock alerts
5. ✅ Test in development before deploying to production

Good luck! 🚀
