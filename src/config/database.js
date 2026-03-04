const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      
      maxPoolSize: 50, 
      minPoolSize: 10, 
      serverSelectionTimeoutMS: 5000, 
      socketTimeoutMS: 45000, 
      family: 4, 

      
      maxIdleTimeMS: 30000, 
      waitQueueTimeoutMS: 10000, 
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Connection pool configured: min=10, max=50`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
