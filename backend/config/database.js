const mongoose = require('mongoose');

async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected:', conn.connection.host);

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected. Mongoose will auto-reconnect.');
    });
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected.');
    });
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err.message);
    });
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

module.exports = connectDB;

