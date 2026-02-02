/**
 * Email Service Quick Reference
 * Common email operations at a glance
 */

const emailService = require('./emailService');

// ============================================================================
// BASIC USAGE
// ============================================================================

// 1. Send Welcome Email
const sendWelcome = async (user, password) => {
  return await emailService.sendWelcomeEmail(user, password);
};

// 2. Send Password Reset
const sendReset = async (user, newPassword) => {
  return await emailService.sendPasswordResetEmail(user, newPassword);
};

// 3. Send Low Stock Alert
const sendLowStock = async (items, adminEmail) => {
  return await emailService.sendLowStockAlert(items, adminEmail);
};

// 4. Send Invoice
const sendInvoice = async (invoice, customerEmail, pdfBuffer) => {
  return await emailService.sendInvoiceEmail(invoice, customerEmail, pdfBuffer);
};

// 5. Send Custom Email
const sendCustom = async (to, subject, htmlContent) => {
  return await emailService.sendCustomEmail(to, subject, htmlContent);
};

// 6. Test Connection
const testEmail = async () => {
  return await emailService.testConnection();
};

// ============================================================================
// COMMON PATTERNS
// ============================================================================

// Pattern 1: User Registration
async function onUserRegistration(userData) {
  const crypto = require('crypto');
  const tempPassword = crypto.randomBytes(8).toString('hex');

  const user = {
    fullName: userData.fullName,
    username: userData.username,
    email: userData.email,
    role: userData.role
  };

  // Send email asynchronously
  emailService.sendWelcomeEmail(user, tempPassword)
    .then(result => console.log('Welcome email sent:', result.success))
    .catch(error => console.error('Email failed:', error));
}

// Pattern 2: Password Reset
async function onPasswordReset(userId) {
  const User = require('../models/User');
  const crypto = require('crypto');

  const user = await User.findById(userId);
  const newPassword = crypto.randomBytes(8).toString('hex');

  user.password = newPassword;
  await user.save();

  await emailService.sendPasswordResetEmail(user, newPassword);
}

// Pattern 3: Daily Low Stock Check
async function dailyLowStockCheck() {
  const Inventory = require('../models/Inventory');
  const User = require('../models/User');

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
}

// Pattern 4: Invoice Generation
async function onInvoiceGeneration(invoiceData, customerEmail) {
  // Generate PDF (use your PDF service)
  const pdfBuffer = generatePDF(invoiceData);

  const invoice = {
    invoiceNumber: invoiceData.number,
    customerName: invoiceData.customerName,
    date: new Date(),
    totalAmount: invoiceData.total,
    currency: 'USD'
  };

  await emailService.sendInvoiceEmail(invoice, customerEmail, pdfBuffer);
}

// Pattern 5: Bulk Notifications
async function sendBulkNotification(message, subject) {
  const User = require('../models/User');
  const users = await User.find({ isActive: true });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>${subject}</h2>
      <p>${message}</p>
    </div>
  `;

  // Use queue to avoid rate limiting
  users.forEach(user => {
    emailService.addToQueue({
      to: user.email,
      subject: subject,
      html: htmlContent
    });
  });
}

// Mock PDF generator
function generatePDF(data) {
  return Buffer.from(`Invoice ${data.number}`, 'utf-8');
}

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

// Using node-cron
function setupEmailSchedules() {
  const cron = require('node-cron');

  // Daily at 9 AM: Check low stock
  cron.schedule('0 9 * * *', dailyLowStockCheck);

  // Weekly on Monday at 10 AM: Send reports
  cron.schedule('0 10 * * 1', sendWeeklyReports);

  console.log('Email schedules initialized');
}

async function sendWeeklyReports() {
  const User = require('../models/User');
  const admins = await User.find({ role: 'admin', isActive: true });

  const reportHtml = `
    <h1>Weekly Inventory Report</h1>
    <p>Your weekly inventory summary...</p>
  `;

  for (const admin of admins) {
    await emailService.sendCustomEmail(
      admin.email,
      'Weekly Inventory Report',
      reportHtml
    );
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

async function sendEmailWithErrorHandling(emailFunction, ...args) {
  try {
    const result = await emailFunction(...args);

    if (result.success) {
      console.log('✅ Email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } else {
      console.error('❌ Email failed:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return { success: false, error: error.message };
  }
}

// Usage
async function example() {
  const user = { email: 'test@example.com', fullName: 'Test User' };
  await sendEmailWithErrorHandling(
    emailService.sendWelcomeEmail,
    user,
    'TempPass123'
  );
}

// ============================================================================
// TESTING
// ============================================================================

// Quick test function
async function quickTest(testEmail) {
  console.log('Testing email service...\n');

  // Test 1: Connection
  const connection = await emailService.testConnection();
  console.log('1. Connection:', connection.success ? '✅' : '❌');

  // Test 2: Send test email
  const result = await emailService.sendCustomEmail(
    testEmail,
    'Test Email',
    '<h1>Test successful!</h1>'
  );
  console.log('2. Test Email:', result.success ? '✅' : '❌');

  console.log('\nTest complete!');
}

// ============================================================================
// ENVIRONMENT VARIABLES REQUIRED
// ============================================================================

/*
# .env file configuration

# Choose provider: 'smtp', 'gmail', or 'sendgrid'
EMAIL_PROVIDER=gmail

# For Gmail
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# For SendGrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# For SMTP
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASSWORD=your-password

# General settings
EMAIL_FROM=noreply@yourcompany.com
COMPANY_NAME=Your Company Name
COMPANY_EMAIL=support@yourcompany.com
COMPANY_PHONE=+1-234-567-8900
SUPPORT_EMAIL=support@yourcompany.com
CLIENT_URL=http://localhost:3000
TEST_EMAIL=your-test-email@example.com
*/

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Basic operations
  sendWelcome,
  sendReset,
  sendLowStock,
  sendInvoice,
  sendCustom,
  testEmail,

  // Common patterns
  onUserRegistration,
  onPasswordReset,
  dailyLowStockCheck,
  onInvoiceGeneration,
  sendBulkNotification,

  // Scheduled tasks
  setupEmailSchedules,
  sendWeeklyReports,

  // Utilities
  sendEmailWithErrorHandling,
  quickTest
};

// ============================================================================
// QUICK COMMAND REFERENCE
// ============================================================================

/*
# Run email tests
npm run test:email

# Test from Node REPL
node
> const email = require('./src/utils/emailService')
> email.testConnection().then(console.log)

# Send test welcome email
node
> const email = require('./src/utils/emailService')
> const user = { fullName: 'Test', username: 'test', email: 'test@example.com', role: 'employee' }
> email.sendWelcomeEmail(user, 'Pass123').then(console.log)

# Check if email service is working
node
> require('./src/utils/emailServiceQuickRef').quickTest('your@email.com')
*/
