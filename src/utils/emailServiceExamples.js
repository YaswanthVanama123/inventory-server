/**
 * Email Service Integration Examples
 *
 * This file shows practical examples of how to integrate the email service
 * into your controllers and routes.
 */

const emailService = require('../utils/emailService');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const crypto = require('crypto');

// ============================================================================
// Example 1: User Registration with Welcome Email
// ============================================================================

/**
 * Create a new user and send welcome email
 * Route: POST /api/users
 */
const createUserWithEmail = async (req, res) => {
  try {
    const { username, email, fullName, role } = req.body;

    // Generate temporary password
    const temporaryPassword = crypto.randomBytes(8).toString('hex');

    // Create user in database
    const user = await User.create({
      username,
      email,
      fullName,
      role: role || 'employee',
      password: temporaryPassword,
      createdBy: req.user._id
    });

    // Send welcome email asynchronously (don't wait for it)
    emailService.sendWelcomeEmail(user, temporaryPassword)
      .then(result => {
        if (result.success) {
          console.log(`Welcome email sent to ${user.email}`);
        } else {
          console.error(`Failed to send welcome email: ${result.error}`);
        }
      });

    // Respond immediately
    res.status(201).json({
      success: true,
      message: 'User created successfully. Welcome email sent.',
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================================================
// Example 2: Password Reset with Email Notification
// ============================================================================

/**
 * Reset user password and send notification email
 * Route: POST /api/users/:id/reset-password
 */
const resetPasswordWithEmail = async (req, res) => {
  try {
    const { id } = req.params;

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new temporary password
    const newPassword = crypto.randomBytes(8).toString('hex');

    // Update user password
    user.password = newPassword;
    await user.save();

    // Send password reset email
    const emailResult = await emailService.sendPasswordResetEmail(user, newPassword);

    if (emailResult.success) {
      res.json({
        success: true,
        message: 'Password reset successfully. Email sent to user.'
      });
    } else {
      // Password was reset but email failed
      res.json({
        success: true,
        message: 'Password reset successfully, but email delivery failed.',
        warning: emailResult.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================================================
// Example 3: Low Stock Alert (Scheduled Task)
// ============================================================================

/**
 * Check for low stock items and send alerts
 * This can be run as a cron job or scheduled task
 */
const checkAndAlertLowStock = async () => {
  try {
    console.log('Running low stock check...');

    // Find items below minimum stock level
    const lowStockItems = await Inventory.find({
      $expr: { $lte: ['$quantity.current', '$quantity.minimum'] },
      isActive: true
    }).select('itemName skuCode category quantity supplier');

    if (lowStockItems.length === 0) {
      console.log('No low stock items found');
      return;
    }

    console.log(`Found ${lowStockItems.length} low stock items`);

    // Get all admin users
    const admins = await User.find({
      role: 'admin',
      isActive: true
    }).select('email fullName');

    if (admins.length === 0) {
      console.log('No admin users found to send alerts');
      return;
    }

    // Send alert to each admin
    const emailPromises = admins.map(admin =>
      emailService.sendLowStockAlert(lowStockItems, admin.email)
    );

    const results = await Promise.all(emailPromises);

    const successCount = results.filter(r => r.success).length;
    console.log(`Low stock alerts sent: ${successCount}/${admins.length}`);

  } catch (error) {
    console.error('Error in low stock check:', error);
  }
};

// ============================================================================
// Example 4: Invoice Generation and Email
// ============================================================================

/**
 * Generate invoice PDF and send via email
 * Route: POST /api/invoices/generate
 */
const generateAndEmailInvoice = async (req, res) => {
  try {
    const { invoiceData, customerEmail } = req.body;

    // Validate invoice data
    if (!invoiceData || !customerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Invoice data and customer email are required'
      });
    }

    // Generate PDF buffer
    // Note: You would use your PDF generation service here
    // For this example, we'll use a mock buffer
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Send invoice email
    const emailResult = await emailService.sendInvoiceEmail(
      invoiceData,
      customerEmail,
      pdfBuffer
    );

    if (emailResult.success) {
      res.json({
        success: true,
        message: 'Invoice generated and sent successfully',
        messageId: emailResult.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send invoice email',
        error: emailResult.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Mock PDF generation function (replace with actual PDF service)
async function generateInvoicePDF(invoiceData) {
  // In a real application, use PDFKit or similar
  const mockPdfContent = `Invoice ${invoiceData.invoiceNumber}`;
  return Buffer.from(mockPdfContent, 'utf-8');
}

// ============================================================================
// Example 5: Bulk Email with Queue
// ============================================================================

/**
 * Send bulk notifications using email queue
 * Route: POST /api/notifications/bulk
 */
const sendBulkNotifications = async (req, res) => {
  try {
    const { message, subject } = req.body;

    // Get all active users
    const users = await User.find({ isActive: true }).select('email fullName');

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active users found'
      });
    }

    // Create HTML content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${subject}</h2>
          <p>${message}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            This is an automated notification from ${process.env.COMPANY_NAME || 'Inventory System'}
          </p>
        </body>
      </html>
    `;

    // Add emails to queue
    users.forEach(user => {
      emailService.addToQueue({
        to: user.email,
        subject: subject,
        html: htmlContent
      });
    });

    // Respond immediately (emails will be sent in background)
    res.json({
      success: true,
      message: `Bulk notification queued for ${users.length} users`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================================================
// Example 6: Setup Scheduled Tasks
// ============================================================================

/**
 * Initialize scheduled email tasks
 * Call this function when your server starts
 */
const initializeScheduledEmails = () => {
  // Option 1: Using node-cron (npm install node-cron)
  /*
  const cron = require('node-cron');

  // Run low stock check every day at 9 AM
  cron.schedule('0 9 * * *', () => {
    console.log('Running scheduled low stock check');
    checkAndAlertLowStock();
  });

  // Send weekly report every Monday at 10 AM
  cron.schedule('0 10 * * 1', () => {
    console.log('Generating weekly report');
    sendWeeklyReport();
  });
  */

  // Option 2: Using setInterval (simple approach)
  // Check low stock every 24 hours
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    checkAndAlertLowStock();
  }, TWENTY_FOUR_HOURS);

  // Run once on startup
  checkAndAlertLowStock();

  console.log('Scheduled email tasks initialized');
};

// ============================================================================
// Example 7: Email Service Health Check
// ============================================================================

/**
 * Test email service configuration
 * Route: GET /api/admin/email-health
 */
const checkEmailHealth = async (req, res) => {
  try {
    const result = await emailService.testConnection();

    res.json({
      success: result.success,
      message: result.message,
      provider: process.env.EMAIL_PROVIDER || 'smtp',
      from: process.env.EMAIL_FROM || 'not configured'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================================================
// Example 8: Send Test Email
// ============================================================================

/**
 * Send a test email to verify configuration
 * Route: POST /api/admin/send-test-email
 */
const sendTestEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    const htmlContent = `
      <h1>Test Email</h1>
      <p>This is a test email from your inventory management system.</p>
      <p>If you received this email, your email service is configured correctly!</p>
      <p><strong>Configuration:</strong></p>
      <ul>
        <li>Provider: ${process.env.EMAIL_PROVIDER || 'smtp'}</li>
        <li>From: ${process.env.EMAIL_FROM || 'not set'}</li>
        <li>Company: ${process.env.COMPANY_NAME || 'not set'}</li>
      </ul>
    `;

    const result = await emailService.sendCustomEmail(
      email,
      'Test Email - Inventory System',
      htmlContent
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test email',
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================================================================
// Export all examples
// ============================================================================

module.exports = {
  // User management with emails
  createUserWithEmail,
  resetPasswordWithEmail,

  // Inventory alerts
  checkAndAlertLowStock,

  // Invoice emails
  generateAndEmailInvoice,

  // Bulk operations
  sendBulkNotifications,

  // Scheduled tasks
  initializeScheduledEmails,

  // Health checks
  checkEmailHealth,
  sendTestEmail
};

// ============================================================================
// Usage in Express Routes
// ============================================================================

/*
// In your routes file (e.g., routes/users.js):
const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const {
  createUserWithEmail,
  resetPasswordWithEmail
} = require('../examples/emailServiceExamples');

// Create user with welcome email
router.post('/users', auth, adminAuth, createUserWithEmail);

// Reset password with email notification
router.post('/users/:id/reset-password', auth, adminAuth, resetPasswordWithEmail);

module.exports = router;
*/

/*
// In your main server file (e.g., server.js):
const { initializeScheduledEmails } = require('./examples/emailServiceExamples');

// Initialize email service and scheduled tasks
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start scheduled email tasks
  initializeScheduledEmails();
});
*/
