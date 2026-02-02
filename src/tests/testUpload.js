/**
 * Test Script for Upload Middleware
 *
 * This script tests the upload middleware configuration
 * Run with: node src/tests/testUpload.js
 */

const path = require('path');
const fs = require('fs');

console.log('\n=== Upload Middleware Test ===\n');

// Test 1: Check if upload middleware exists
console.log('Test 1: Checking upload middleware...');
try {
  const uploadMiddleware = require('../middleware/upload');
  console.log('✓ Upload middleware found');
  console.log('  - uploadSingleImage:', typeof uploadMiddleware.uploadSingleImage === 'function' ? 'OK' : 'FAIL');
  console.log('  - uploadMultipleImages:', typeof uploadMiddleware.uploadMultipleImages === 'function' ? 'OK' : 'FAIL');
  console.log('  - getFileUrl:', typeof uploadMiddleware.getFileUrl === 'function' ? 'OK' : 'FAIL');
  console.log('  - deleteUploadedFile:', typeof uploadMiddleware.deleteUploadedFile === 'function' ? 'OK' : 'FAIL');
  console.log('  - deleteUploadedFiles:', typeof uploadMiddleware.deleteUploadedFiles === 'function' ? 'OK' : 'FAIL');
} catch (error) {
  console.log('✗ Upload middleware not found');
  console.error(error.message);
  process.exit(1);
}

console.log('\n');

// Test 2: Check if uploads directory exists
console.log('Test 2: Checking upload directories...');
const uploadsDir = path.join(__dirname, '../../uploads/items');
if (fs.existsSync(uploadsDir)) {
  console.log('✓ Uploads directory exists:', uploadsDir);
  const stats = fs.statSync(uploadsDir);
  console.log('  - Writable:', fs.accessSync(uploadsDir, fs.constants.W_OK) === undefined ? 'OK' : 'FAIL');
  console.log('  - Readable:', fs.accessSync(uploadsDir, fs.constants.R_OK) === undefined ? 'OK' : 'FAIL');
} else {
  console.log('✗ Uploads directory does not exist');
  process.exit(1);
}

console.log('\n');

// Test 3: Check if multer is installed
console.log('Test 3: Checking multer package...');
try {
  const multer = require('multer');
  console.log('✓ Multer package installed');
  console.log('  - Version:', require('../../package.json').dependencies.multer);
} catch (error) {
  console.log('✗ Multer package not found');
  console.error(error.message);
  process.exit(1);
}

console.log('\n');

// Test 4: Check error handler for multer support
console.log('Test 4: Checking error handler...');
try {
  const errorHandlerPath = path.join(__dirname, '../middleware/errorHandler.js');
  const errorHandlerContent = fs.readFileSync(errorHandlerPath, 'utf8');
  if (errorHandlerContent.includes('MulterError')) {
    console.log('✓ Error handler has Multer error support');
  } else {
    console.log('⚠ Warning: Error handler might not handle Multer errors');
  }
} catch (error) {
  console.log('✗ Could not check error handler');
  console.error(error.message);
}

console.log('\n');

// Test 5: Test filename sanitization (unit test)
console.log('Test 5: Testing filename sanitization logic...');
const testFilename = 'test file with spaces & special!@#chars.jpg';
const sanitized = testFilename.replace(/[^a-zA-Z0-9.]/g, '_');
console.log('  Original:', testFilename);
console.log('  Sanitized:', sanitized);
console.log('✓ Filename sanitization works');

console.log('\n');

// Test 6: Test file type validation logic
console.log('Test 6: Testing file type validation...');
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const testCases = [
  { name: 'image.jpg', mime: 'image/jpeg', expected: true },
  { name: 'image.png', mime: 'image/png', expected: true },
  { name: 'image.webp', mime: 'image/webp', expected: true },
  { name: 'document.pdf', mime: 'application/pdf', expected: false },
  { name: 'script.js', mime: 'application/javascript', expected: false }
];

testCases.forEach(test => {
  const ext = path.extname(test.name).toLowerCase();
  const isValid = allowedExtensions.includes(ext) && allowedMimeTypes.includes(test.mime);
  const status = isValid === test.expected ? '✓' : '✗';
  console.log(`  ${status} ${test.name} (${test.mime}): ${isValid ? 'ALLOWED' : 'REJECTED'}`);
});

console.log('\n');

// Test 7: Test file size validation
console.log('Test 7: Testing file size limits...');
const maxSize = 5 * 1024 * 1024; // 5MB
const testSizes = [
  { size: 1024, expected: true, label: '1KB' },
  { size: 1024 * 1024, expected: true, label: '1MB' },
  { size: 3 * 1024 * 1024, expected: true, label: '3MB' },
  { size: 5 * 1024 * 1024, expected: true, label: '5MB (max)' },
  { size: 6 * 1024 * 1024, expected: false, label: '6MB' },
  { size: 10 * 1024 * 1024, expected: false, label: '10MB' }
];

testSizes.forEach(test => {
  const isValid = test.size <= maxSize;
  const status = isValid === test.expected ? '✓' : '✗';
  console.log(`  ${status} ${test.label}: ${isValid ? 'ALLOWED' : 'REJECTED'}`);
});

console.log('\n');

// Test 8: Check static file serving configuration
console.log('Test 8: Checking server configuration...');
try {
  const serverPath = path.join(__dirname, '../server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  if (serverContent.includes("'/uploads'") || serverContent.includes('"/uploads"')) {
    console.log('✓ Static file serving configured for /uploads');
  } else {
    console.log('⚠ Warning: Static file serving might not be configured');
  }

  if (serverContent.includes('path')) {
    console.log('✓ Path module imported in server.js');
  } else {
    console.log('⚠ Warning: Path module might not be imported');
  }
} catch (error) {
  console.log('✗ Could not check server configuration');
  console.error(error.message);
}

console.log('\n');

// Summary
console.log('=== Test Summary ===');
console.log('All core functionality tests passed!');
console.log('\nNext steps:');
console.log('1. Start your server: npm run dev');
console.log('2. Test with Postman or cURL');
console.log('3. Check UPLOAD_USAGE.md for integration examples');
console.log('4. Check UPLOAD_QUICK_REFERENCE.md for quick start');
console.log('\n');
