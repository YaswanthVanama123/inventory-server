const mongoose = require('mongoose');
const Inventory = require('./src/models/Inventory');

async function fixWheatStock() {
  try {
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory-management');
    console.log('Connected to MongoDB');

    
    const wheat = await Inventory.findOne({ itemName: 'Wheat' });

    if (!wheat) {
      console.log('Wheat item not found');
      process.exit(0);
    }

    console.log('Current wheat quantity:', wheat.quantity);
    console.log('Stock history:', wheat.stockHistory);

    
    wheat.quantity = {
      current: 200,  
      minimum: 0,
      unit: 'kg'
    };

    await wheat.save();
    console.log('✅ Wheat stock fixed! New quantity:', wheat.quantity);

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixWheatStock();
