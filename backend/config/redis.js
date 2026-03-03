const Redis = require('ioredis');

/* ── In-memory fallback used when Redis is unavailable ── */
class MemoryStore {
  constructor() {
    this._store = new Map();
    this._timers = new Map();
    console.warn('⚠️  Redis unavailable — using in-memory session store (sessions lost on restart)');
  }

  async get(key) {
    return this._store.get(key) ?? null;
  }

  async setex(key, ttlSeconds, value) {
    this._store.set(key, value);
    // Clear any previous timer and set a new one
    if (this._timers.has(key)) clearTimeout(this._timers.get(key));
    const timer = setTimeout(() => {
      this._store.delete(key);
      this._timers.delete(key);
    }, ttlSeconds * 1000);
    this._timers.set(key, timer);
  }

  async del(key) {
    if (this._timers.has(key)) clearTimeout(this._timers.get(key));
    this._timers.delete(key);
    this._store.delete(key);
  }
}

let redisClient;

try {
  const client = new Redis(process.env.REDIS_URL, {
    // Fail fast rather than retrying indefinitely in dev
    lazyConnect:            true,
    enableOfflineQueue:     false,
    retryStrategy:          (times) => (times > 3 ? null : 200 * times),
    maxRetriesPerRequest:   1,
  });

  client.on('connect', () => console.log('✅ Redis connected'));
  client.on('error', () => {}); // silenced — handled by fallback below

  // Attempt connection; swap to fallback if it fails within 2 s
  client.connect().catch(() => {});

  redisClient = client;

  // Replace with memory store on first error (before any real usage)
  client.once('error', () => {
    redisClient = new MemoryStore();
  });
} catch {
  redisClient = new MemoryStore();
}

module.exports = redisClient;

