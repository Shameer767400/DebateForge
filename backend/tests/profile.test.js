const request = require('supertest');
const { app } = require('../server');
const { User, Debate } = require('../models');

// Helper: register + return cookie
async function getAuthCookie(overrides = {}) {
  const defaults = {
    username: 'profileuser',
    email: 'profile@example.com',
    password: 'SecurePass1!',
  };
  const body = { ...defaults, ...overrides };

  const regRes = await request(app)
    .post('/api/auth/register')
    .set('User-Agent', 'Mozilla/5.0 JestTest')
    .send(body);

  const cookies = regRes.headers['set-cookie'] || [];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

describe('Profile Endpoints', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Debate.deleteMany({});
  });

  /* ── GET /api/profile/me ── */
  describe('GET /api/profile/me', () => {
    it('should return the authenticated user profile', async () => {
      const authCookie = await getAuthCookie();

      const res = await request(app)
        .get('/api/profile/me')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(200);
      // Profile response should include core stats
      expect(res.body).toHaveProperty('user');
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .get('/api/profile/me')
        .set('User-Agent', 'Mozilla/5.0 JestTest');

      expect(res.statusCode).toBe(401);
    });
  });

  /* ── GET /api/profile/fallacies ── */
  describe('GET /api/profile/fallacies', () => {
    it('should return fallacy profile for authenticated user', async () => {
      const authCookie = await getAuthCookie();

      const res = await request(app)
        .get('/api/profile/fallacies')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(200);
      // Should return fallacy data (empty for new user)
      expect(res.body).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .get('/api/profile/fallacies')
        .set('User-Agent', 'Mozilla/5.0 JestTest');

      expect(res.statusCode).toBe(401);
    });
  });

  /* ── GET /api/profile/leaderboard ── */
  describe('GET /api/profile/leaderboard', () => {
    it('should return leaderboard', async () => {
      const authCookie = await getAuthCookie();

      const res = await request(app)
        .get('/api/profile/leaderboard')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(200);
    });
  });

  /* ── PUT /api/profile/bio ── */
  describe('PUT /api/profile/bio', () => {
    it('should update user bio', async () => {
      const authCookie = await getAuthCookie();

      const res = await request(app)
        .put('/api/profile/bio')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({ bio: 'I love debating!' });

      expect(res.statusCode).toBe(200);
    });
  });
});
