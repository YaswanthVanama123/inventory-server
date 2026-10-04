const mongoose = require('mongoose');
const Screen = require('../models/Screen');
require('dotenv').config();

async function updateScreenCategories() {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory-management';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    const deleteResult = await Screen.deleteMany({ category: 'GoAudits' });
    console.log(`✅ Removed ${deleteResult.deletedCount} GoAudits screens`);

    const screenPermissionService = require('../services/screenPermission.service');
    const screens = await screenPermissionService.initializeDefaultScreens();
    console.log(`✅ Initialized ${screens.length} screens with new categories`);

    const allScreens = await Screen.find({}).distinct('category');
    console.log('\n📋 Current screen categories:');
    allScreens.forEach(cat => console.log(`   - ${cat}`));

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

updateScreenCategories();
