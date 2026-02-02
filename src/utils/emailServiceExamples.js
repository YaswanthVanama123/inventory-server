

const emailService = require('../utils/emailService');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const crypto = require('crypto');






const createUserWithEmail = async (req, res) => {
  try {
    const { username, email, fullName, role } = req.body;

    
    const temporaryPassword = crypto.randomBytes(8).toString('hex');

    
    const user = await User.create({
      username,
      email,
      fullName,
      role: role || 'employee',
      password: temporaryPassword,
      createdBy: req.user._id
    });

    
    emailService.sendWelcomeEmail(user, temporaryPassword)
      .then(result => {
        if (result.success) {
          console.log(`Welcome email sent to ${user.email}`);
        } else {
          console.error(`Failed to send welcome email: ${result.error}`);
        }
      });

    
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






const resetPasswordWithEmail = async (req, res) => {
  try {
    const { id } = req.params;

    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    
    const newPassword = crypto.randomBytes(8).toString('hex');

    
    user.password = newPassword;
    await user.save();

    
    const emailResult = await emailService.sendPasswordResetEmail(user, newPassword);

    if (emailResult.success) {
      res.json({
        success: true,
        message: 'Password reset successfully. Email sent to user.'
      });
    } else {
      
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






const checkAndAlertLowStock = async () => {
  try {
    console.log('Running low stock check...');

    
    const lowStockItems = await Inventory.find({
      $expr: { $lte: ['$quantity.current', '$quantity.minimum'] },
      isActive: true
    }).select('itemName skuCode category quantity supplier');

    if (lowStockItems.length === 0) {
      console.log('No low stock items found');
      return;
    }

    console.log(`Found ${lowStockItems.length} low stock items`);

    
    const admins = await User.find({
      role: 'admin',
      isActive: true
    }).select('email fullName');

    if (admins.length === 0) {
      console.log('No admin users found to send alerts');
      return;
    }

    
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






const generateAndEmailInvoice = async (req, res) => {
  try {
    const { invoiceData, customerEmail } = req.body;

    
    if (!invoiceData || !customerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Invoice data and customer email are required'
      });
    }

    
    
    
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    
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


async function generateInvoicePDF(invoiceData) {
  
  const mockPdfContent = `Invoice ${invoiceData.invoiceNumber}`;
  return Buffer.from(mockPdfContent, 'utf-8');
}






const sendBulkNotifications = async (req, res) => {
  try {
    const { message, subject } = req.body;

    
    const users = await User.find({ isActive: true }).select('email fullName');

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active users found'
      });
    }

    
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

    
    users.forEach(user => {
      emailService.addToQueue({
        to: user.email,
        subject: subject,
        html: htmlContent
      });
    });

    
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






const initializeScheduledEmails = () => {
  
  

  
  
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    checkAndAlertLowStock();
  }, TWENTY_FOUR_HOURS);

  
  checkAndAlertLowStock();

  console.log('Scheduled email tasks initialized');
};






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





module.exports = {
  
  createUserWithEmail,
  resetPasswordWithEmail,

  
  checkAndAlertLowStock,

  
  generateAndEmailInvoice,

  
  sendBulkNotifications,

  
  initializeScheduledEmails,

  
  checkEmailHealth,
  sendTestEmail
};








