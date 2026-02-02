# Email Service Utility - Documentation

## Overview

The Email Service utility provides a comprehensive solution for sending transactional emails from your inventory management system. It supports multiple email providers, includes retry logic, email queuing, and comes with professionally designed HTML email templates.

## Features

- **Multiple Email Providers**: Support for Gmail, SendGrid, and custom SMTP servers
- **Retry Logic**: Automatic retry mechanism with configurable attempts
- **Email Queue**: Optional queue support for batch email processing
- **HTML Templates**: Beautiful, responsive email templates
- **Error Handling**: Graceful error handling with detailed logging
- **PDF Attachments**: Support for attaching invoice PDFs and other files

## Installation

Install the required dependency:

```bash
npm install nodemailer
```

## Configuration

### Environment Variables

Add the following variables to your `.env` file:

```env
# Email Provider Selection
EMAIL_PROVIDER=smtp  # Options: 'smtp', 'gmail', 'sendgrid'

# For Gmail (Recommended for development)
EMAIL_PROVIDER=gmail
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password

# For SendGrid (Recommended for production)
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your-sendgrid-api-key

# For Custom SMTP
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-smtp-password

# General Email Settings
EMAIL_FROM=noreply@yourdomain.com
COMPANY_NAME=Your Company Name
COMPANY_EMAIL=support@yourdomain.com
COMPANY_PHONE=+1-234-567-8900
SUPPORT_EMAIL=support@yourdomain.com
CLIENT_URL=http://localhost:3000
```

### Gmail Setup

1. Go to your Google Account settings
2. Enable 2-Step Verification
3. Generate an App Password: https://myaccount.google.com/apppasswords
4. Use the 16-character app password in your `.env` file

### SendGrid Setup

1. Sign up for SendGrid: https://sendgrid.com
2. Create an API key with full access
3. Verify your sender email address
4. Add the API key to your `.env` file

## Usage

### Initialize Email Service

The email service initializes automatically when you first use it, but you can also initialize it manually:

```javascript
const emailService = require('./utils/emailService');

// Optional: Initialize on app startup
await emailService.initialize();

// Test connection
const result = await emailService.testConnection();
console.log(result); // { success: true, message: '...' }
```

### Send Invoice Email

```javascript
const emailService = require('./utils/emailService');

// Invoice object structure
const invoice = {
  invoiceNumber: 'INV-001',
  customerName: 'John Doe',
  date: new Date(),
  totalAmount: 1250.00,
  currency: 'USD'
};

const recipientEmail = 'customer@example.com';
const pdfBuffer = /* PDF buffer from your PDF generation service */;

const result = await emailService.sendInvoiceEmail(
  invoice,
  recipientEmail,
  pdfBuffer
);

if (result.success) {
  console.log('Invoice sent successfully!');
} else {
  console.error('Failed to send invoice:', result.error);
}
```

### Send Low Stock Alert

```javascript
const emailService = require('./utils/emailService');

// Get low stock items from database
const lowStockItems = await Inventory.find({
  $expr: { $lte: ['$quantity.current', '$quantity.minimum'] }
});

const adminEmail = 'admin@example.com';

const result = await emailService.sendLowStockAlert(
  lowStockItems,
  adminEmail
);
```

### Send Welcome Email

```javascript
const emailService = require('./utils/emailService');

// When creating a new user
const user = {
  fullName: 'Jane Smith',
  username: 'jsmith',
  email: 'jane@example.com',
  role: 'employee'
};

const temporaryPassword = 'TempPass123!';

const result = await emailService.sendWelcomeEmail(
  user,
  temporaryPassword
);
```

### Send Password Reset Email

```javascript
const emailService = require('./utils/emailService');

// When resetting a user's password
const user = {
  fullName: 'John Doe',
  username: 'jdoe',
  email: 'john@example.com'
};

const newPassword = 'NewTemp456!';

const result = await emailService.sendPasswordResetEmail(
  user,
  newPassword
);
```

### Send Custom Email

```javascript
const emailService = require('./utils/emailService');

const htmlContent = `
  <h1>Custom Email</h1>
  <p>This is a custom email message.</p>
`;

const attachments = [
  {
    filename: 'document.pdf',
    content: pdfBuffer,
    contentType: 'application/pdf'
  }
];

const result = await emailService.sendCustomEmail(
  'recipient@example.com',
  'Custom Subject',
  htmlContent,
  attachments
);
```

### Using Email Queue

For bulk email operations, use the queue to avoid rate limiting:

```javascript
const emailService = require('./utils/emailService');

// Add multiple emails to queue
users.forEach(user => {
  emailService.addToQueue({
    to: user.email,
    subject: 'Bulk Notification',
    html: '<p>Your message here</p>'
  });
});

// Queue will process automatically with delays between emails
```

## Email Templates

All email templates are located in `/server/src/templates/emails/` and use a simple placeholder syntax:

### Template Placeholders

Templates use `{{placeholder}}` syntax for dynamic content:

```html
<p>Hello {{fullName}},</p>
<p>Your username is: {{username}}</p>
```

### Available Templates

1. **invoice.html** - For sending invoices with PDF attachments
2. **lowStock.html** - For low stock inventory alerts
3. **welcome.html** - For new user account creation
4. **passwordReset.html** - For password reset notifications

### Customizing Templates

To customize templates:

1. Open the template file in `/server/src/templates/emails/`
2. Modify the HTML/CSS as needed
3. Keep the `{{placeholder}}` tags for dynamic content
4. Test using the `testConnection()` method

## Integration Examples

### In User Controller (Create User)

```javascript
const User = require('../models/User');
const emailService = require('../utils/emailService');
const crypto = require('crypto');

const createUser = async (req, res) => {
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

    // Send welcome email
    await emailService.sendWelcomeEmail(user, temporaryPassword);

    res.status(201).json({
      success: true,
      message: 'User created successfully. Welcome email sent.',
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

### In Inventory Controller (Check Low Stock)

```javascript
const Inventory = require('../models/Inventory');
const emailService = require('../utils/emailService');

const checkLowStock = async () => {
  try {
    // Find items with low stock
    const lowStockItems = await Inventory.find({
      $expr: { $lte: ['$quantity.current', '$quantity.minimum'] },
      isActive: true
    });

    if (lowStockItems.length > 0) {
      // Get admin emails
      const admins = await User.find({ role: 'admin', isActive: true });

      // Send alert to each admin
      for (const admin of admins) {
        await emailService.sendLowStockAlert(lowStockItems, admin.email);
      }

      console.log(`Low stock alert sent for ${lowStockItems.length} items`);
    }
  } catch (error) {
    console.error('Error checking low stock:', error);
  }
};

// Run daily using cron or scheduler
```

### In Invoice Controller (Generate Invoice)

```javascript
const emailService = require('../utils/emailService');
const PDFDocument = require('pdfkit'); // You'll need to install this

const generateAndSendInvoice = async (req, res) => {
  try {
    const { invoiceData, customerEmail } = req.body;

    // Generate PDF (simplified example)
    const doc = new PDFDocument();
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);

      // Send invoice email
      const result = await emailService.sendInvoiceEmail(
        invoiceData,
        customerEmail,
        pdfBuffer
      );

      if (result.success) {
        res.json({
          success: true,
          message: 'Invoice generated and sent successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to send invoice email'
        });
      }
    });

    doc.text('Invoice content here...');
    doc.end();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
```

## Scheduled Tasks

### Daily Low Stock Check

Create a scheduled task to check for low stock daily:

```javascript
// server/src/utils/scheduledTasks.js
const cron = require('node-cron'); // npm install node-cron
const Inventory = require('../models/Inventory');
const User = require('../models/User');
const emailService = require('./emailService');

// Run every day at 9 AM
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
  }
});
```

## Error Handling

The email service includes comprehensive error handling:

- Automatic retry on failure (3 attempts by default)
- Graceful degradation if email service is unavailable
- Detailed error logging
- Success/failure response objects

```javascript
const result = await emailService.sendInvoiceEmail(invoice, email, pdf);

if (result.success) {
  console.log('Email sent:', result.messageId);
} else {
  console.error('Email failed:', result.error);
  // Your error handling logic
}
```

## Troubleshooting

### Common Issues

1. **Gmail "Less Secure Apps" Error**
   - Use App Password instead of regular password
   - Enable 2-Step Verification first

2. **Connection Timeout**
   - Check firewall settings
   - Verify SMTP port (587 for TLS, 465 for SSL)
   - Check SMTP_SECURE setting

3. **SendGrid Errors**
   - Verify sender email is authenticated
   - Check API key permissions
   - Ensure you're not exceeding rate limits

4. **Template Not Found**
   - Verify template files exist in `/server/src/templates/emails/`
   - Check file names match exactly (case-sensitive)

### Testing

Test your email configuration:

```javascript
const emailService = require('./utils/emailService');

// Test connection
const test = async () => {
  const result = await emailService.testConnection();
  console.log(result);
};

test();
```

## Security Best Practices

1. **Never commit `.env` file** - Keep credentials secure
2. **Use App Passwords** - Don't use regular account passwords
3. **Enable TLS** - Always use secure connections
4. **Validate Inputs** - Sanitize email addresses and content
5. **Rate Limiting** - Use email queue to avoid spam flags
6. **Monitor Usage** - Track email sending for unusual patterns

## Performance Tips

1. Use email queue for bulk operations
2. Initialize service once at app startup
3. Use transactional email services (SendGrid) for production
4. Implement email verification for user-provided addresses
5. Cache templates if sending many similar emails

## License

This email service utility is part of the Inventory Management System.
