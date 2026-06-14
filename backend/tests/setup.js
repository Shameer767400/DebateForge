const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Set env vars BEFORE any test imports server.js (which calls process.exit if missing)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest-32chars!!';
process.env.NODE_ENV = 'test';

// Increase default timeout for slow startup in CI/local runs
jest.setTimeout(30000);

let mongoServer;

beforeAll(async () => {
  // Start an in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  // Set the environment variable so the app uses it if needed elsewhere
  process.env.MONGODB_URI = uri;
  
  // Connect Mongoose to the in-memory db
  await mongoose.connect(uri);
});

afterAll(async () => {
  // Disconnect Mongoose and stop the in-memory server
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Clean up all data between tests to ensure test isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
});
