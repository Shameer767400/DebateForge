const request = require('supertest');
const { app } = require('../server');
const { Topic } = require('../models');

describe('Topic Endpoints', () => {
  beforeEach(async () => {
    await Topic.deleteMany({});
  });

  /* ── GET /api/topics ── */
  describe('GET /api/topics', () => {
    it('should return empty when no topics exist', async () => {
      const res = await request(app)
        .get('/api/topics')
        .set('User-Agent', 'Mozilla/5.0 JestTest');

      expect(res.statusCode).toBe(200);
      expect(res.body.topics).toEqual([]);
    });

    it('should return seeded topics', async () => {
      await Topic.create([
        { title: 'AI Ethics in Modern Society', category: 'technology', difficulty: 'medium', isActive: true },
        { title: 'Climate Policy and Global Governance', category: 'environment', difficulty: 'hard', isActive: true },
      ]);

      const res = await request(app)
        .get('/api/topics')
        .set('User-Agent', 'Mozilla/5.0 JestTest');

      expect(res.statusCode).toBe(200);
      expect(res.body.topics).toHaveLength(2);
      expect(res.body.byCategory).toHaveProperty('technology');
      expect(res.body.byCategory).toHaveProperty('environment');
    });

    it('should not require authentication', async () => {
      // GET /api/topics is public — no cookie needed
      const res = await request(app)
        .get('/api/topics')
        .set('User-Agent', 'Mozilla/5.0 JestTest');

      expect(res.statusCode).toBe(200);
    });
  });

  /* ── POST /api/topics/propose ── */
  describe('POST /api/topics/propose', () => {
    let authCookie;

    beforeEach(async () => {
      // Register a user for authenticated endpoints
      const regRes = await request(app)
        .post('/api/auth/register')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .send({
          username: 'topicuser',
          email: 'topic@example.com',
          password: 'SecurePass1!',
        });
      const cookies = regRes.headers['set-cookie'] || [];
      authCookie = cookies.map((c) => c.split(';')[0]).join('; ');
    });

    it('should create a proposed topic', async () => {
      const res = await request(app)
        .post('/api/topics/propose')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({
          title: 'Should remote work be mandatory for desk jobs?',
          category: 'society',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.topic).toHaveProperty('title', 'Should remote work be mandatory for desk jobs?');
      expect(res.body.topic).toHaveProperty('isActive', false); // pending review
      expect(res.body.message).toMatch(/submitted/i);
    });

    it('should reject a title that is too short', async () => {
      const res = await request(app)
        .post('/api/topics/propose')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({ title: 'too short', category: 'society' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/10 and 200/i);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/topics/propose')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .send({ title: 'Unauthenticated topic proposal test, long enough', category: 'society' });

      expect(res.statusCode).toBe(401);
    });
  });
});
