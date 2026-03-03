const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

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
