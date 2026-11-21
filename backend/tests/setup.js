const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// Set env vars BEFORE any test imports server.js (which calls process.exit if missing)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest-32chars!!';
process.env.NODE_ENV = 'test';
// Use in-memory store in tests to prevent background Redis network retry loops
process.env.REDIS_URL = '';

// Timeout for slow startup in CI/local runs
jest.setTimeout(60000);

let mongoServer;

beforeAll(async () => {
  // Start a transaction-capable in-memory replica set
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
});

afterAll(async () => {
  // Disconnect Mongoose and stop the in-memory replica set
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  // Clean up all data between tests to ensure test isolation
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany();
    }
  }
});
