






const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('\n========================================');
console.log('Configuration Verification');
console.log('========================================\n');

let hasErrors = false;


console.log('📋 CustomerConnect Configuration:');
if (process.env.CUSTOMERCONNECT_BASE_URL) {
  console.log(`   ✓ BASE_URL: ${process.env.CUSTOMERCONNECT_BASE_URL}`);
} else {
  console.log('   ✗ BASE_URL: MISSING');
  hasErrors = true;
}

if (process.env.CUSTOMERCONNECT_USERNAME) {
  console.log(`   ✓ USERNAME: ${process.env.CUSTOMERCONNECT_USERNAME}`);
} else {
  console.log('   ✗ USERNAME: MISSING');
  hasErrors = true;
}

if (process.env.CUSTOMERCONNECT_PASSWORD) {
  console.log('   ✓ PASSWORD: ••••••••');
} else {
  console.log('   ✗ PASSWORD: MISSING');
  hasErrors = true;
}


console.log('\n📋 RouteStar Configuration:');
if (process.env.ROUTESTAR_BASE_URL) {
  console.log(`   ✓ BASE_URL: ${process.env.ROUTESTAR_BASE_URL}`);
} else {
  console.log('   ✗ BASE_URL: MISSING');
  hasErrors = true;
}

if (process.env.ROUTESTAR_USERNAME) {
  console.log(`   ✓ USERNAME: ${process.env.ROUTESTAR_USERNAME}`);
} else {
  console.log('   ✗ USERNAME: MISSING');
  hasErrors = true;
}

if (process.env.ROUTESTAR_PASSWORD) {
  console.log('   ✓ PASSWORD: ••••••••');
} else {
  console.log('   ✗ PASSWORD: MISSING');
  hasErrors = true;
}


console.log('\n⚙️  Browser Settings:');
console.log(`   HEADLESS: ${process.env.HEADLESS || 'true (default)'}`);


console.log('\n🔧 Loading Automation Configs:');
try {
  const ccConfig = require('../src/automation/config/customerconnect.config');
  const rsConfig = require('../src/automation/config/routestar.config');

  console.log('   ✓ CustomerConnect config loaded');
  console.log(`      - baseUrl: ${ccConfig.baseUrl || 'MISSING'}`);
  console.log(`      - credentials: ${ccConfig.credentials.username ? '✓' : '✗'}`);

  console.log('   ✓ RouteStar config loaded');
  console.log(`      - baseUrl: ${rsConfig.baseUrl || 'MISSING'}`);
  console.log(`      - credentials: ${rsConfig.credentials.username ? '✓' : '✗'}`);
} catch (error) {
  console.log(`   ✗ Error loading configs: ${error.message}`);
  hasErrors = true;
}


console.log('\n🎯 Loading Selectors:');
try {
  const ccSelectors = require('../src/automation/selectors/customerconnect.selectors');
  const rsSelectors = require('../src/automation/selectors/routestar.selectors');

  console.log('   ✓ CustomerConnect selectors loaded');
  console.log(`      - username: ${ccSelectors.login.username}`);
  console.log(`      - password: ${ccSelectors.login.password}`);
  console.log(`      - submitButton: ${ccSelectors.login.submitButton}`);

  console.log('   ✓ RouteStar selectors loaded');
  console.log(`      - username: ${rsSelectors.login.username}`);
  console.log(`      - password: ${rsSelectors.login.password}`);
  console.log(`      - submitButton: ${rsSelectors.login.submitButton}`);
} catch (error) {
  console.log(`   ✗ Error loading selectors: ${error.message}`);
  hasErrors = true;
}


console.log('\n========================================');
if (hasErrors) {
  console.log('❌ Configuration has errors!');
  console.log('\nPlease check:');
  console.log('1. .env file exists in project root');
  console.log('2. All required variables are set');
  console.log('3. Variable names match exactly\n');
  process.exit(1);
} else {
  console.log('✅ Configuration is valid!');
  console.log('\nYou can now run tests:');
  console.log('  npm run test:customerconnect');
  console.log('  npm run test:routestar');
  console.log('  npm run test:all');
  console.log('\nTo see browser during test:');
  console.log('  HEADLESS=false npm run test:customerconnect\n');
}
