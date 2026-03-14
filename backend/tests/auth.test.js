const request = require('supertest');
const { app } = require('../server');
const { User } = require('../models');

// Configure test environment variables for the app
process.env.JWT_SECRET = 'test-secret-key';

describe('Auth Endpoints', () => {
  
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'securepassword123'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('username', 'testuser');
      expect(res.body.user).toHaveProperty('email', 'test@example.com');
      
      // Verify user was actually saved in DB
      const dbUser = await User.findOne({ username: 'testuser' });
      expect(dbUser).toBeTruthy();
      expect(dbUser.email).toBe('test@example.com');
    });

    it('should fail if email is already taken', async () => {
      // Create user first
      await User.create({
        username: 'existinguser',
        email: 'test@example.com',
        passwordHash: 'hashedpassword'
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.error).toMatch(/already taken/i);
    });

    it('should fail if password is too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testu',
          email: 'test2@example.com',
          password: 'short' // less than 8 chars
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/8 characters long/i);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register a user to login with
      await request(app).post('/api/auth/register').send({
        username: 'loginuser',
        email: 'login@example.com',
        password: 'loginpassword1'
      });
    });

    it('should login successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'loginpassword1'
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('token');
 expect(res.body.user.username).toBe('loginuser');
    });
    it('should fail login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword'
        });


      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/invalid credentials/i);
    });
  });

});
