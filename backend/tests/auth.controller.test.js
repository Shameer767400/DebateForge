const request = require('supertest');
const { app } = require('../server');
const { User } = require('../models');

describe('Auth Endpoints', () => {
  const withUA = (req) => req.set('User-Agent', 'Mozilla/5.0 JestTest');

  // Helper: register and return cookie
  async function registerAndGetCookie(overrides = {}) {
    const defaults = {
      username: 'authuser',
      email: 'auth@example.com',
      password: 'SecurePass1!',
    };
    const body = { ...defaults, ...overrides };
    const res = await withUA(request(app).post('/api/auth/register')).send(body);
    const cookies = res.headers['set-cookie'] || [];
    return cookies.map((c) => c.split(';')[0]).join('; ');
  }

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await withUA(request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'SecurePass1!'
        }));

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
      // Create verified user first (controller only allows replacement of unverified accounts)
      await User.create({
        username: 'existinguser',
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        emailVerified: true,
      });

      const res = await withUA(request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          email: 'test@example.com',
          password: 'SecurePass1!'
        }));

      expect(res.statusCode).toEqual(409);
      expect(res.body.error).toMatch(/already registered and verified/i);
    });

    it('should fail if password is too short', async () => {
      const res = await withUA(request(app)
        .post('/api/auth/register')
        .send({
          username: 'testu',
          email: 'test2@example.com',
          password: 'short' // less than 8 chars
        }));

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/at least 8 characters/i);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register a user to login with
      await withUA(request(app).post('/api/auth/register')).send({
        username: 'loginuser',
        email: 'login@example.com',
        password: 'LoginPass1!'
      });
    });

    it('should login successfully with correct credentials', async () => {
      const res = await withUA(request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'LoginPass1!'
        }));

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.username).toBe('loginuser');
    });

    it('should fail login with wrong password', async () => {
      const res = await withUA(request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword'
        }));

      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/invalid credentials/i);
    });

    it('should set an HTTP-only cookie on login', async () => {
      const res = await withUA(request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'LoginPass1!'
        }));

      expect(res.statusCode).toEqual(200);
      const setCookieHeader = res.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const tokenCookie = setCookieHeader.find((c) => c.startsWith('token='));
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toMatch(/httponly/i);
    });
  });

  /* ── GET /api/auth/session ── */
  describe('GET /api/auth/session', () => {
    it('should return authenticated: true with valid cookie', async () => {
      const cookie = await registerAndGetCookie({
        username: 'sessionuser',
        email: 'session@example.com',
      });

      const res = await withUA(request(app)
        .get('/api/auth/session')
        .set('Cookie', cookie));

      expect(res.statusCode).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user).toHaveProperty('username', 'sessionuser');
    });

    it('should return authenticated: false without cookie', async () => {
      const res = await withUA(request(app).get('/api/auth/session'));

      expect(res.statusCode).toBe(200);
      expect(res.body.authenticated).toBe(false);
    });
  });

  /* ── POST /api/auth/logout ── */
  describe('POST /api/auth/logout', () => {
    it('should clear the token cookie', async () => {
      const cookie = await registerAndGetCookie({
        username: 'logoutuser',
        email: 'logout@example.com',
      });

      const res = await withUA(request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie));

      expect(res.statusCode).toBe(200);

      // Verify the cookie is cleared (set to empty or expired)
      const setCookieHeader = res.headers['set-cookie'];
      if (setCookieHeader) {
        const tokenCookie = setCookieHeader.find((c) => c.startsWith('token='));
        if (tokenCookie) {
          // Cookie should be cleared (empty value or max-age=0)
          expect(
            tokenCookie.includes('token=;') ||
            tokenCookie.includes('Max-Age=0') ||
            tokenCookie.includes('max-age=0') ||
            tokenCookie.includes('Expires=Thu, 01 Jan 1970')
          ).toBe(true);
        }
      }
    });
  });

  /* ── POST /api/auth/refresh ── */
  describe('POST /api/auth/refresh', () => {
    it('should refresh the token and return user data', async () => {
      const cookie = await registerAndGetCookie({
        username: 'refreshuser',
        email: 'refresh@example.com',
      });

      const res = await withUA(request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookie));

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('user');

      // A new cookie should be set
      const setCookieHeader = res.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const res = await withUA(request(app).post('/api/auth/refresh'));

      expect(res.statusCode).toBe(401);
    });
  });

  /* ── POST /api/auth/change-password ── */
  describe('POST /api/auth/change-password', () => {
    it('should change password with correct current password', async () => {
      const cookie = await registerAndGetCookie({
        username: 'changepwuser',
        email: 'changepw@example.com',
        password: 'OldPassword1!',
      });

      const res = await withUA(request(app)
        .post('/api/auth/change-password')
        .set('Cookie', cookie)
        .send({
          currentPassword: 'OldPassword1!',
          newPassword: 'NewPassword2!',
        }));

      expect(res.statusCode).toBe(200);

      // Verify login works with new password
      const loginRes = await withUA(request(app)
        .post('/api/auth/login')
        .send({
          email: 'changepw@example.com',
          password: 'NewPassword2!',
        }));

      expect(loginRes.statusCode).toBe(200);
    });

    it('should reject with wrong current password', async () => {
      const cookie = await registerAndGetCookie({
        username: 'wrongpwuser',
        email: 'wrongpw@example.com',
        password: 'CorrectPass1!',
      });

      const res = await withUA(request(app)
        .post('/api/auth/change-password')
        .set('Cookie', cookie)
        .send({
          currentPassword: 'WrongPass99!',
          newPassword: 'NewPassword2!',
        }));

      expect(res.statusCode).toBe(401);
    });
  });
});
