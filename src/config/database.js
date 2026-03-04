const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Connection pool settings for better performance
      maxPoolSize: 50, // Maximum number of connections (default: 100)
      minPoolSize: 10, // Minimum number of connections (default: 0)
      serverSelectionTimeoutMS: 5000, // How long to wait for server selection
      socketTimeoutMS: 45000, // How long a socket can be inactive
      family: 4, // Use IPv4, skip IPv6 lookup (faster connection)

      // Query optimization
      maxIdleTimeMS: 30000, // Close idle connections after 30s
      waitQueueTimeoutMS: 10000, // Max wait time when pool is exhausted
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Connection pool configured: min=10, max=50`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
