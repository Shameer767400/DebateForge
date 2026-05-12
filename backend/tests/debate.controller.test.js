const request = require('supertest');
const { app } = require('../server');
const { User, Topic, Debate } = require('../models');

// Helper: register + login, return auth cookie string
async function getAuthCookie() {
  const regRes = await request(app)
    .post('/api/auth/register')
    .set('User-Agent', 'Mozilla/5.0 JestTest')
    .send({
      username: 'debateuser',
      email: 'debate@example.com',
      password: 'SecurePass1!',
    });

  // Cookie is set via Set-Cookie header
  const cookies = regRes.headers['set-cookie'] || [];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

describe('Debate Endpoints', () => {
  let authCookie;
  let testTopicId;

  beforeEach(async () => {
    // Seed a topic (must be in beforeEach because setup.js clears collections after each test)
    const topic = await Topic.create({
      title: 'AI will replace most jobs within decades',
      category: 'technology',
      difficulty: 'medium',
      isActive: true,
    });
    testTopicId = topic._id.toString();

    // Fresh user for each test
    authCookie = await getAuthCookie();
  });

  /* ── POST /api/debates/start ── */
  describe('POST /api/debates/start', () => {
    it('should start a debate with a preset topic', async () => {
      const res = await request(app)
        .post('/api/debates/start')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({
          topicId: testTopicId,
          side: 'for',
          difficulty: 'beginner',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('debateId');
      expect(res.body.topicSnapshot).toBe('AI will replace most jobs within decades');
      expect(res.body.userSide).toBe('for');
      expect(res.body.difficulty).toBe('beginner');
    });

    it('should start a debate with a custom topic', async () => {
      const res = await request(app)
        .post('/api/debates/start')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({
          customTopic: 'Pineapple belongs on pizza',
          side: 'against',
          difficulty: 'expert',
          persona: 'socratic',
          format: 'oxford',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.topicSnapshot).toBe('Pineapple belongs on pizza');
      expect(res.body.persona).toBe('socratic');
      expect(res.body.format).toBe('oxford');
    });

    it('should return 404 for a non-existent topicId', async () => {
      const fakeId = '000000000000000000000000';
      const res = await request(app)
        .post('/api/debates/start')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({ topicId: fakeId, side: 'for', difficulty: 'beginner' });

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toMatch(/topic not found/i);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/debates/start')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .send({ topicId: testTopicId, side: 'for', difficulty: 'beginner' });

      expect(res.statusCode).toBe(401);
    });

    it('should normalize devil difficulty to devils_advocate', async () => {
      const res = await request(app)
        .post('/api/debates/start')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({
          customTopic: 'Test devil mode normalization',
          side: 'for',
          difficulty: 'devil',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.difficulty).toBe('devils_advocate');
    });
  });

  /* ── GET /api/debates/history ── */
  describe('GET /api/debates/history', () => {
    it('should return empty history for a new user', async () => {
      const res = await request(app)
        .get('/api/debates/history')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(200);
      expect(res.body.debates).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('should return debates after creating one', async () => {
      // Create a debate first
      await request(app)
        .post('/api/debates/start')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({
          customTopic: 'Testing history endpoint',
          side: 'for',
          difficulty: 'beginner',
        });

      const res = await request(app)
        .get('/api/debates/history')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(200);
      expect(res.body.debates).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/debates/history?page=1&limit=5')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pages');
    });
  });

  /* ── GET /api/debates/:id ── */
  describe('GET /api/debates/:id', () => {
    it('should return a specific debate by ID', async () => {
      const createRes = await request(app)
        .post('/api/debates/start')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({
          customTopic: 'Specific debate retrieval test',
          side: 'against',
          difficulty: 'intermediate',
        });

      const debateId = createRes.body.debateId;

      const res = await request(app)
        .get(`/api/debates/${debateId}`)
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(200);
      expect(res.body.debate).toHaveProperty('topicSnapshot', 'Specific debate retrieval test');
    });

    it('should return 404 for non-existent debate', async () => {
      const res = await request(app)
        .get('/api/debates/000000000000000000000000')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(404);
    });

    it('should prevent IDOR — user cannot access another user\'s debate', async () => {
      // Create debate as user A
      const createRes = await request(app)
        .post('/api/debates/start')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', authCookie)
        .send({
          customTopic: 'IDOR prevention test',
          side: 'for',
          difficulty: 'beginner',
        });

      const debateId = createRes.body.debateId;

      // Register user B
      const regB = await request(app)
        .post('/api/auth/register')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .send({
          username: 'otheruser',
          email: 'other@example.com',
          password: 'SecurePass2!',
        });
      const cookieB = (regB.headers['set-cookie'] || [])
        .map((c) => c.split(';')[0]).join('; ');

      // User B tries to access user A's debate
      const res = await request(app)
        .get(`/api/debates/${debateId}`)
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', cookieB);

      expect(res.statusCode).toBe(404);
    });
  });
});
