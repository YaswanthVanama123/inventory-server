require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/database');

const seedAdmin = async () => {
  try {
    // Connect to database
    await connectDB();

    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: 'admin' });

    if (existingAdmin) {
      console.log('Admin user already exists');
      console.log('Username: admin');
      process.exit(0);
    }

    // Create default admin user
    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@inventory.com',
      password: 'Admin@123',  // Change this password immediately after first login
      fullName: 'System Administrator',
      role: 'admin',
      isActive: true
    });

    console.log('✓ Admin user created successfully!');
    console.log('=====================================');
    console.log('Username: admin');
    console.log('Password: Admin@123');
    console.log('=====================================');
    console.log('IMPORTANT: Please change this password immediately after first login!');

    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error.message);
    process.exit(1);
  }
};

seedAdmin();
