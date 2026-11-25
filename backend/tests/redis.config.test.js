'use strict';

const request = require('supertest');
const { app } = require('../server');
const redisClient = require('../config/redis');
const { MemoryStore, normalizeRedisUrl } = require('../config/redis');
const { RedisRateLimitStore, createRateLimitStore } = require('../utils/rateLimitStore');

describe('Redis Config & Fallback Resilience', () => {
  describe('normalizeRedisUrl', () => {
    it('trims whitespace and strips surrounding single or double quotes', () => {
      expect(normalizeRedisUrl('  "rediss://default:pass@host.upstash.io:6379"  ')).toBe(
        'rediss://default:pass@host.upstash.io:6379'
      );
      expect(normalizeRedisUrl("'redis://localhost:6379'")).toBe('redis://localhost:6379');
      expect(normalizeRedisUrl('')).toBe('');
      expect(normalizeRedisUrl(null)).toBe('');
    });
  });

  describe('MemoryStore fallback operations', () => {
    let store;

    beforeEach(() => {
      store = new MemoryStore();
    });

    afterEach(async () => {
      await store.quit();
    });

    it('supports get, set, setex TTL, and del', async () => {
      await store.set('k1', 'v1');
      expect(await store.get('k1')).toBe('v1');

      await store.setex('k2', 0.05, 'ephemeral');
      expect(await store.get('k2')).toBe('ephemeral');

      await new Promise((r) => setTimeout(r, 80));
      expect(await store.get('k2')).toBeNull();

      await store.del('k1');
      expect(await store.get('k1')).toBeNull();
    });

    it('supports sorted sets (zadd uniqueness, zrangebyscore, zremrangebyscore)', async () => {
      await store.zadd('ts:test', 100, 'a');
      await store.zadd('ts:test', 200, 'b');
      await store.zadd('ts:test', 150, 'a'); // updates score, keeps unique

      expect(await store.zrangebyscore('ts:test', '-inf', '+inf')).toEqual(['a', 'b']);
      expect(await store.zremrangebyscore('ts:test', '-inf', 160)).toBe(1);
      expect(await store.zrangebyscore('ts:test', 0, 500)).toEqual(['b']);
    });

    it('tracks atomic fixed-window hits, decrements, and resets after expiry', async () => {
      const hit1 = await store.incrWindow('rl:auth:1.2.3.4', 60);
      const hit2 = await store.incrWindow('rl:auth:1.2.3.4', 60);
      expect(hit1.totalHits).toBe(1);
      expect(hit2.totalHits).toBe(2);
      expect(hit2.resetTime).toBeInstanceOf(Date);

      expect(await store.decr('rl:auth:1.2.3.4')).toBe(1);

      await new Promise((r) => setTimeout(r, 80));
      const hitAfterReset = await store.incrWindow('rl:auth:1.2.3.4', 60);
      expect(hitAfterReset.totalHits).toBe(1);
    });
  });

  describe('wrapper safe degradation', () => {
    it('reports memory store ready when REDIS_URL is empty', () => {
      expect(redisClient.status()).toEqual({
        store: 'memory',
        connected: true,
        status: 'ready',
      });
      expect(redisClient.getClient()).toBeNull();
    });

    it('falls back seamlessly to MemoryStore when an ioredis command rejects', async () => {
      const origClient = redisClient._redisClient;
      const origUsing = redisClient._usingRedis;
      const origBackend = redisClient._backend;

      const failingMockClient = {
        status: 'ready',
        get: jest.fn().mockRejectedValue(new Error("Stream isn't writeable")),
      };

      await redisClient.set('fallback:test', 'ok');
      redisClient._redisClient = failingMockClient;
      redisClient._usingRedis = true;
      redisClient._backend = failingMockClient;

      const value = await redisClient.get('fallback:test');
      expect(value).toBe('ok');
      expect(redisClient.status().store).toBe('memory');

      redisClient._redisClient = origClient;
      redisClient._usingRedis = origUsing;
      redisClient._backend = origBackend;
      await redisClient.del('fallback:test');
    });
  });

  describe('RedisRateLimitStore', () => {
    it('configures unique prefix, increment, decrement, and resetKey', async () => {
      const store = createRateLimitStore('unit');
      expect(store).toBeInstanceOf(RedisRateLimitStore);
      expect(store.prefix).toBe('rl:unit:');
      expect(store.localKeys).toBe(false);

      store.init({ windowMs: 5000 });
      const r1 = await store.increment('client-1');
      const r2 = await store.increment('client-1');
      expect(r1.totalHits).toBe(1);
      expect(r2.totalHits).toBe(2);

      await store.decrement('client-1');
      const r3 = await store.increment('client-1');
      expect(r3.totalHits).toBe(2);

      await store.resetKey('client-1');
      const r4 = await store.increment('client-1');
      expect(r4.totalHits).toBe(1);
    });
  });

  describe('GD Waiting Hall Redis sync integration', () => {
    it('syncs joined participants into active session:${debateId} in Redis store', async () => {
      const regHost = await request(app)
        .post('/api/auth/register')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .send({ username: 'gdhost', email: 'gdhost@example.com', password: 'SecurePass1!' });
      const hostCookie = (regHost.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

      const regPeer = await request(app)
        .post('/api/auth/register')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .send({ username: 'gdpeer', email: 'gdpeer@example.com', password: 'SecurePass1!' });
      const peerCookie = (regPeer.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

      const startRes = await request(app)
        .post('/api/debates/start')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', hostCookie)
        .send({
          customTopic: 'Redis GD Participant Sync Test',
          side: 'for',
          difficulty: 'beginner',
          format: 'group_discussion',
        });

      expect(startRes.statusCode).toBe(201);
      const { debateId, roomCode } = startRes.body;
      expect(roomCode).toBeTruthy();

      await redisClient.setex(
        `session:${debateId}`,
        3600,
        JSON.stringify({ debateId, status: 'waiting', participants: [] })
      );

      const joinRes = await request(app)
        .post('/api/debates/join-gd')
        .set('User-Agent', 'Mozilla/5.0 JestTest')
        .set('Cookie', peerCookie)
        .send({ roomCode });

      expect(joinRes.statusCode).toBe(200);
      const rawSession = await redisClient.get(`session:${debateId}`);
      const parsed = JSON.parse(rawSession);
      expect(parsed.participants.some((p) => p.name === 'gdpeer')).toBe(true);

      await redisClient.del(`session:${debateId}`);
    });
  });
});
