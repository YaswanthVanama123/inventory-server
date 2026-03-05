

const emailService = require('./emailService');
const TEST_EMAIL = process.env.TEST_EMAIL || 'your-email@example.com';
async function testConnection() {
  console.log('\n🔍 Testing email service connection...');
  const result = await emailService.testConnection();
  if (result.success) {
    console.log('✅ Email service is configured correctly');
  } else {
    console.log('❌ Email service configuration error:', result.message);
  }
  return result.success;
}
async function testWelcomeEmail() {
  console.log('\n📧 Testing welcome email...');
  const testUser = {
    fullName: 'Test User',
    username: 'testuser',
    email: TEST_EMAIL,
    role: 'employee'
  };
  const temporaryPassword = 'TempPass123!';
  const result = await emailService.sendWelcomeEmail(testUser, temporaryPassword);
  if (result.success) {
    console.log('✅ Welcome email sent successfully');
    console.log('   Message ID:', result.messageId);
  } else {
    console.log('❌ Failed to send welcome email:', result.error);
  }
  return result.success;
}
async function testPasswordResetEmail() {
  console.log('\n🔐 Testing password reset email...');
  const testUser = {
    fullName: 'Test User',
    username: 'testuser',
    email: TEST_EMAIL
  };
  const newPassword = 'NewTemp456!';
  const result = await emailService.sendPasswordResetEmail(testUser, newPassword);
  if (result.success) {
    console.log('✅ Password reset email sent successfully');
    console.log('   Message ID:', result.messageId);
  } else {
    console.log('❌ Failed to send password reset email:', result.error);
  }
  return result.success;
}
async function testLowStockAlert() {
  console.log('\n⚠️  Testing low stock alert email...');
  const testItems = [
    {
      itemName: 'Laptop Dell XPS 15',
      skuCode: 'LAPTOP-001',
      category: 'Electronics',
      quantity: { current: 3, minimum: 10 },
      supplier: { name: 'Tech Supplies Inc.' }
    },
    {
      itemName: 'Office Chair Ergonomic',
      skuCode: 'CHAIR-101',
      category: 'Furniture',
      quantity: { current: 2, minimum: 5 },
      supplier: { name: 'Furniture World' }
    },
    {
      itemName: 'USB-C Cable 2m',
      skuCode: 'CABLE-USB-C-2M',
      category: 'Electronics',
      quantity: { current: 8, minimum: 25 },
      supplier: { name: 'Tech Supplies Inc.' }
    }
  ];
  const result = await emailService.sendLowStockAlert(testItems, TEST_EMAIL);
  if (result.success) {
    console.log('✅ Low stock alert sent successfully');
    console.log('   Message ID:', result.messageId);
  } else {
    console.log('❌ Failed to send low stock alert:', result.error);
  }
  return result.success;
}
async function testInvoiceEmail() {
  console.log('\n📄 Testing invoice email...');
  const testInvoice = {
    invoiceNumber: 'INV-TEST-001',
    customerName: 'Test Customer',
    date: new Date(),
    totalAmount: 1250.50,
    currency: 'USD'
  };
  const mockPdfContent = `
    ====================================
    INVOICE #${testInvoice.invoiceNumber}
    ====================================
    Customer: ${testInvoice.customerName}
    Date: ${testInvoice.date.toLocaleDateString()}
    Total Amount: $${testInvoice.totalAmount}
    Thank you for your business!
    ====================================
  `;
  const pdfBuffer = Buffer.from(mockPdfContent, 'utf-8');
  const result = await emailService.sendInvoiceEmail(
    testInvoice,
    TEST_EMAIL,
    pdfBuffer
  );
  if (result.success) {
    console.log('✅ Invoice email sent successfully');
    console.log('   Message ID:', result.messageId);
  } else {
    console.log('❌ Failed to send invoice email:', result.error);
  }
  return result.success;
}
async function testCustomEmail() {
  console.log('\n✉️  Testing custom email...');
  const customHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Custom Email Test</h1>
        </div>
        <div class="content">
          <p>This is a test of the custom email functionality.</p>
          <p>It demonstrates how you can send custom HTML emails.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  const result = await emailService.sendCustomEmail(
    TEST_EMAIL,
    'Custom Email Test',
    customHtml
  );
  if (result.success) {
    console.log('✅ Custom email sent successfully');
    console.log('   Message ID:', result.messageId);
  } else {
    console.log('❌ Failed to send custom email:', result.error);
  }
  return result.success;
}
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('    Email Service Test Suite');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Test emails will be sent to: ${TEST_EMAIL}`);
  console.log('Make sure to set TEST_EMAIL in your .env file\n');
  const results = {
    connection: false,
    welcome: false,
    passwordReset: false,
    lowStock: false,
    invoice: false,
    custom: false
  };
  try {
    results.connection = await testConnection();
    if (!results.connection) {
      console.log('\n❌ Email service not configured. Skipping email tests.');
      console.log('Please configure email settings in .env file\n');
      return results;
    }
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(2000);
    results.welcome = await testWelcomeEmail();
    await delay(2000);
    results.passwordReset = await testPasswordResetEmail();
    await delay(2000);
    results.lowStock = await testLowStockAlert();
    await delay(2000);
    results.invoice = await testInvoiceEmail();
    await delay(2000);
    results.custom = await testCustomEmail();
    console.log('\n═══════════════════════════════════════════════════');
    console.log('    Test Results Summary');
    console.log('═══════════════════════════════════════════════════');
    const successCount = Object.values(results).filter(r => r).length;
    const totalTests = Object.keys(results).length;
    Object.entries(results).forEach(([test, success]) => {
      const icon = success ? '✅' : '❌';
      const status = success ? 'PASSED' : 'FAILED';
      console.log(`${icon} ${test.padEnd(20)} ${status}`);
    });
    console.log('═══════════════════════════════════════════════════');
    console.log(`Results: ${successCount}/${totalTests} tests passed`);
    console.log('═══════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
  }
  return results;
}
module.exports = {
  testConnection,
  testWelcomeEmail,
  testPasswordResetEmail,
  testLowStockAlert,
  testInvoiceEmail,
  testCustomEmail,
  runAllTests
};
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
  runAllTests()
    .then(() => {
      console.log('Test suite completed\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}
