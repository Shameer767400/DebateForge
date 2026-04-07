/**
 * Migration: Auto-mark all existing users as emailVerified = true
 * Run once: node seeds/mark-existing-verified.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');

async function migrate() {
  await connectDB();

  const result = await mongoose.connection.db
    .collection('users')
    .updateMany(
      { emailVerified: { $exists: false } },
      { $set: { emailVerified: true, loginAttempts: 0, lockUntil: null } }
    );

  // eslint-disable-next-line no-console
  console.log(`✅ Marked ${result.modifiedCount} existing users as email-verified.`);
  process.exit(0);
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err);
  process.exit(1);
});
