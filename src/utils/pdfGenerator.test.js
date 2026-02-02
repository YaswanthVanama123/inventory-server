/**
 * Comprehensive Test Suite for PDF Generator
 * Tests various scenarios and edge cases
 */

const { generateInvoicePDF, formatCurrency, formatDate } = require('./pdfGenerator');
const fs = require('fs').promises;
const path = require('path');

// Test utilities
const testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

function logTest(name, passed, error = null) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✓ ${name}`);
  } else {
    testResults.failed++;
    console.log(`✗ ${name}`);
    if (error) console.error(`  Error: ${error.message}`);
  }
}

// Test data sets
const minimalInvoice = {
  invoiceNumber: 'INV-MIN-001',
  invoiceDate: new Date(),
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  status: 'draft',
  currency: 'USD',
  items: [
    {
      itemName: 'Test Item',
      quantity: 1,
      unitPrice: 100,
      total: 100
    }
  ],
  subtotal: 100,
  grandTotal: 100,
  customer: { name: 'Test Customer' },
  company: { name: 'Test Company' }
};

const fullInvoice = {
  invoiceNumber: 'INV-FULL-001',
  invoiceDate: new Date('2026-02-01'),
  dueDate: new Date('2026-03-03'),
  status: 'paid',
  currency: 'EUR',

  company: {
    name: 'Full Featured Company Ltd.',
    email: 'info@company.com',
    phone: '+44 20 1234 5678',
    website: 'www.company.com',
    taxId: 'GB123456789',
    address: {
      street: '100 Business Road',
      city: 'London',
      state: 'Greater London',
      zipCode: 'SW1A 1AA',
      country: 'United Kingdom'
    }
  },

  customer: {
    name: 'Premium Customer Corp.',
    email: 'billing@customer.com',
    phone: '+44 20 9876 5432',
    taxId: 'GB987654321',
    address: {
      street: '200 Commerce Street',
      city: 'Manchester',
      state: 'Greater Manchester',
      zipCode: 'M1 1AA',
      country: 'United Kingdom'
    }
  },

  items: [
    {
      itemName: 'Premium Service Package',
      skuCode: 'SVC-PREM-001',
      description: 'Comprehensive service package including all premium features',
      quantity: 1,
      unitPrice: 5000.00,
      total: 5000.00
    },
    {
      itemName: 'Additional User Licenses',
      skuCode: 'LIC-USER-100',
      description: 'Pack of 100 user licenses',
      quantity: 3,
      unitPrice: 500.00,
      total: 1500.00
    },
    {
      itemName: 'Support & Maintenance',
      skuCode: 'SUP-MAINT-YR',
      description: 'Annual support and maintenance contract',
      quantity: 1,
      unitPrice: 2000.00,
      total: 2000.00
    }
  ],

  subtotal: 8500.00,

  discount: {
    type: 'percentage',
    value: 15,
    amount: 1275.00
  },

  tax: {
    rate: 20,
    amount: 1445.00
  },

  grandTotal: 8670.00,

  paymentTerms: 'Net 30 days. Payment accepted via bank transfer, credit card, or PayPal. Late payments subject to 2% monthly interest.',

  notes: 'Thank you for choosing our premium service package.\n\nThis invoice includes:\n- Premium Service Package\n- 300 User Licenses\n- Annual Support Contract\n\nFor support inquiries, please contact support@company.com'
};

const multiPageInvoice = {
  invoiceNumber: 'INV-MULTI-001',
  invoiceDate: new Date(),
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  status: 'sent',
  currency: 'USD',
  items: Array.from({ length: 50 }, (_, i) => ({
    itemName: `Test Item ${i + 1}`,
    skuCode: `SKU-${String(i + 1).padStart(3, '0')}`,
    description: `Description for test item ${i + 1}`,
    quantity: Math.floor(Math.random() * 10) + 1,
    unitPrice: Math.random() * 1000,
    total: 0
  })),
  subtotal: 0,
  grandTotal: 0,
  customer: { name: 'Multi-Page Test Customer' },
  company: { name: 'Test Company' }
};

// Calculate totals for multi-page invoice
multiPageInvoice.items.forEach(item => {
  item.total = item.quantity * item.unitPrice;
});
multiPageInvoice.subtotal = multiPageInvoice.items.reduce((sum, item) => sum + item.total, 0);
multiPageInvoice.grandTotal = multiPageInvoice.subtotal;

const currencyTestInvoice = {
  invoiceNumber: 'INV-CURR-001',
  invoiceDate: new Date(),
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  status: 'draft',
  currency: 'INR',
  items: [
    {
      itemName: 'Test Item',
      quantity: 1,
      unitPrice: 10000.50,
      total: 10000.50
    }
  ],
  subtotal: 10000.50,
  grandTotal: 10000.50,
  customer: { name: 'Currency Test Customer' },
  company: { name: 'Test Company' }
};

// Run tests
async function runTests() {
  console.log('\n=== PDF Generator Test Suite ===\n');

  const tempDir = path.join(__dirname, '../../temp/tests');
  await fs.mkdir(tempDir, { recursive: true });

  // Test 1: Format Currency
  console.log('Testing helper functions...');
  try {
    const usd = formatCurrency(1299.99, 'USD');
    logTest('Format USD currency', usd === '$1,299.99');

    const eur = formatCurrency(1299.99, 'EUR');
    logTest('Format EUR currency', eur === '€1,299.99');

    const inr = formatCurrency(10000.50, 'INR');
    logTest('Format INR currency', inr === '₹10,000.50');
  } catch (error) {
    logTest('Format currency', false, error);
  }

  // Test 2: Format Date
  try {
    const formatted = formatDate(new Date('2026-02-01'));
    logTest('Format date', formatted === 'February 1, 2026');
  } catch (error) {
    logTest('Format date', false, error);
  }

  // Test 3: Minimal Invoice
  console.log('\nTesting invoice generation...');
  try {
    const pdf = await generateInvoicePDF(minimalInvoice, { includeQR: false });
    logTest('Generate minimal invoice', pdf instanceof Buffer && pdf.length > 0);

    const outputPath = path.join(tempDir, `${minimalInvoice.invoiceNumber}.pdf`);
    await fs.writeFile(outputPath, pdf);
    logTest('Save minimal invoice to file', true);
  } catch (error) {
    logTest('Generate minimal invoice', false, error);
  }

  // Test 4: Full Invoice with all features
  try {
    const pdf = await generateInvoicePDF(fullInvoice, { includeQR: true });
    logTest('Generate full-featured invoice', pdf instanceof Buffer && pdf.length > 0);

    const outputPath = path.join(tempDir, `${fullInvoice.invoiceNumber}.pdf`);
    await fs.writeFile(outputPath, pdf);
    logTest('Save full invoice to file', true);
  } catch (error) {
    logTest('Generate full-featured invoice', false, error);
  }

  // Test 5: Multi-page Invoice
  try {
    const pdf = await generateInvoicePDF(multiPageInvoice, { includeQR: true });
    logTest('Generate multi-page invoice', pdf instanceof Buffer && pdf.length > 0);

    const outputPath = path.join(tempDir, `${multiPageInvoice.invoiceNumber}.pdf`);
    await fs.writeFile(outputPath, pdf);
    logTest('Save multi-page invoice to file', true);
  } catch (error) {
    logTest('Generate multi-page invoice', false, error);
  }

  // Test 6: Different currencies
  console.log('\nTesting currency support...');
  const currencies = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'];
  for (const currency of currencies) {
    try {
      const testInvoice = { ...currencyTestInvoice, currency, invoiceNumber: `INV-${currency}-001` };
      const pdf = await generateInvoicePDF(testInvoice, { includeQR: false });
      logTest(`Generate ${currency} invoice`, pdf instanceof Buffer && pdf.length > 0);
    } catch (error) {
      logTest(`Generate ${currency} invoice`, false, error);
    }
  }

  // Test 7: Invoice without QR code
  console.log('\nTesting optional features...');
  try {
    const pdf = await generateInvoicePDF(minimalInvoice, { includeQR: false });
    logTest('Generate invoice without QR code', pdf instanceof Buffer && pdf.length > 0);
  } catch (error) {
    logTest('Generate invoice without QR code', false, error);
  }

  // Test 8: Invoice with discount
  console.log('\nTesting financial calculations...');
  try {
    const discountInvoice = {
      ...minimalInvoice,
      invoiceNumber: 'INV-DISC-001',
      subtotal: 1000,
      discount: {
        type: 'percentage',
        value: 10,
        amount: 100
      },
      grandTotal: 900
    };
    const pdf = await generateInvoicePDF(discountInvoice, { includeQR: false });
    logTest('Generate invoice with percentage discount', pdf instanceof Buffer && pdf.length > 0);
  } catch (error) {
    logTest('Generate invoice with percentage discount', false, error);
  }

  // Test 9: Invoice with fixed discount
  try {
    const discountInvoice = {
      ...minimalInvoice,
      invoiceNumber: 'INV-DISC-002',
      subtotal: 1000,
      discount: {
        type: 'fixed',
        value: 50,
        amount: 50
      },
      grandTotal: 950
    };
    const pdf = await generateInvoicePDF(discountInvoice, { includeQR: false });
    logTest('Generate invoice with fixed discount', pdf instanceof Buffer && pdf.length > 0);
  } catch (error) {
    logTest('Generate invoice with fixed discount', false, error);
  }

  // Test 10: Invoice with tax
  try {
    const taxInvoice = {
      ...minimalInvoice,
      invoiceNumber: 'INV-TAX-001',
      subtotal: 1000,
      tax: {
        rate: 10,
        amount: 100
      },
      grandTotal: 1100
    };
    const pdf = await generateInvoicePDF(taxInvoice, { includeQR: false });
    logTest('Generate invoice with tax', pdf instanceof Buffer && pdf.length > 0);
  } catch (error) {
    logTest('Generate invoice with tax', false, error);
  }

  // Test 11: Error handling - missing invoice data
  console.log('\nTesting error handling...');
  try {
    await generateInvoicePDF(null);
    logTest('Handle null invoice', false);
  } catch (error) {
    logTest('Handle null invoice', error.message === 'Invoice data is required');
  }

  // Test 12: Error handling - empty items
  try {
    await generateInvoicePDF({ ...minimalInvoice, items: [] });
    logTest('Handle empty items array', false);
  } catch (error) {
    logTest('Handle empty items array', error.message === 'Invoice must have at least one item');
  }

  // Test 13: Different invoice statuses
  console.log('\nTesting invoice statuses...');
  const statuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
  for (const status of statuses) {
    try {
      const statusInvoice = { ...minimalInvoice, status, invoiceNumber: `INV-${status.toUpperCase()}-001` };
      const pdf = await generateInvoicePDF(statusInvoice, { includeQR: false });
      logTest(`Generate ${status} invoice`, pdf instanceof Buffer && pdf.length > 0);
    } catch (error) {
      logTest(`Generate ${status} invoice`, false, error);
    }
  }

  // Print results
  console.log('\n=== Test Results ===');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed} ✓`);
  console.log(`Failed: ${testResults.failed} ✗`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);

  console.log(`\nTest PDFs saved to: ${tempDir}`);

  if (testResults.failed > 0) {
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests()
    .then(() => {
      console.log('\n✓ All tests completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { runTests };
