

const emailService = require('./emailService');






const sendWelcome = async (user, password) => {
  return await emailService.sendWelcomeEmail(user, password);
};


const sendReset = async (user, newPassword) => {
  return await emailService.sendPasswordResetEmail(user, newPassword);
};


const sendLowStock = async (items, adminEmail) => {
  return await emailService.sendLowStockAlert(items, adminEmail);
};


const sendInvoice = async (invoice, customerEmail, pdfBuffer) => {
  return await emailService.sendInvoiceEmail(invoice, customerEmail, pdfBuffer);
};


const sendCustom = async (to, subject, htmlContent) => {
  return await emailService.sendCustomEmail(to, subject, htmlContent);
};


const testEmail = async () => {
  return await emailService.testConnection();
};






async function onUserRegistration(userData) {
  const crypto = require('crypto');
  const tempPassword = crypto.randomBytes(8).toString('hex');

  const user = {
    fullName: userData.fullName,
    username: userData.username,
    email: userData.email,
    role: userData.role
  };

  
  emailService.sendWelcomeEmail(user, tempPassword)
    .then(result => console.log('Welcome email sent:', result.success))
    .catch(error => console.error('Email failed:', error));
}


async function onPasswordReset(userId) {
  const User = require('../models/User');
  const crypto = require('crypto');

  const user = await User.findById(userId);
  const newPassword = crypto.randomBytes(8).toString('hex');

  user.password = newPassword;
  await user.save();

  await emailService.sendPasswordResetEmail(user, newPassword);
}


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


async function onInvoiceGeneration(invoiceData, customerEmail) {
  
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


async function sendBulkNotification(message, subject) {
  const User = require('../models/User');
  const users = await User.find({ isActive: true });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>${subject}</h2>
      <p>${message}</p>
    </div>
  `;

  
  users.forEach(user => {
    emailService.addToQueue({
      to: user.email,
      subject: subject,
      html: htmlContent
    });
  });
}


function generatePDF(data) {
  return Buffer.from(`Invoice ${data.number}`, 'utf-8');
}






function setupEmailSchedules() {
  const cron = require('node-cron');

  
  cron.schedule('0 9 * * *', dailyLowStockCheck);

  
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


async function example() {
  const user = { email: 'test@example.com', fullName: 'Test User' };
  await sendEmailWithErrorHandling(
    emailService.sendWelcomeEmail,
    user,
    'TempPass123'
  );
}






async function quickTest(testEmail) {
  console.log('Testing email service...\n');

  
  const connection = await emailService.testConnection();
  console.log('1. Connection:', connection.success ? '✅' : '❌');

  
  const result = await emailService.sendCustomEmail(
    testEmail,
    'Test Email',
    '<h1>Test successful!</h1>'
  );
  console.log('2. Test Email:', result.success ? '✅' : '❌');

  console.log('\nTest complete!');
}











module.exports = {
  
  sendWelcome,
  sendReset,
  sendLowStock,
  sendInvoice,
  sendCustom,
  testEmail,

  
  onUserRegistration,
  onPasswordReset,
  dailyLowStockCheck,
  onInvoiceGeneration,
  sendBulkNotification,

  
  setupEmailSchedules,
  sendWeeklyReports,

  
  sendEmailWithErrorHandling,
  quickTest
};






