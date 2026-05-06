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

  async set(key, value) {
    this._store.set(key, value);
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

/*
 * Proxy wrapper that delegates to whatever the current backing store is.
 *
 * Bug fix: the old code exported a direct reference to the ioredis client,
 * then on error it reassigned a local variable — but every other module that
 * had already `require()`-d the file still held the old broken reference.
 * This proxy ensures every call always goes through the current backend.
 */

// Create ONE shared MemoryStore so session data is never lost on fallback
const sharedMemoryStore = new MemoryStore();
// Suppress the constructor log — we'll log when we actually fall back
sharedMemoryStore; // eslint: just reference

const wrapper = {
  _backend: null,

  async get(key)            { return this._backend.get(key); },
  async set(key, value)     { return this._backend.set(key, value); },
  async setex(key, ttl, val){ return this._backend.setex(key, ttl, val); },
  async del(key)            { return this._backend.del(key); },
};

function switchToMemoryStore() {
  if (wrapper._backend !== sharedMemoryStore) {
    wrapper._backend = sharedMemoryStore;
  }
}

try {
  const redisUrl = process.env.REDIS_URL;

  // Quick sanity check: REDIS_URL must look like a URL, not a CLI command
  if (!redisUrl || redisUrl.includes('redis-cli') || !redisUrl.startsWith('redis')) {
    if (redisUrl) {
      console.warn('⚠️  REDIS_URL looks like a CLI command, not a connection string. Falling back to in-memory store.');
    }
    throw new Error('Invalid or missing REDIS_URL');
  }

  const client = new Redis(redisUrl, {
    lazyConnect:          true,
    enableOfflineQueue:   false,
    retryStrategy:        (times) => (times > 3 ? null : 200 * times),
    maxRetriesPerRequest: 1,
    connectTimeout:       3000,
    tls: redisUrl.startsWith('rediss://') ? {} : undefined,
  });

  client.on('connect', () => console.log('✅ Redis connected'));
  client.on('error', () => {}); // silenced — handled by fallback

  client.connect().catch(() => {});

  wrapper._backend = client;

  // On first error, switch to memory store
  client.once('error', switchToMemoryStore);

  // Also switch if not ready within 3 seconds
  setTimeout(() => {
    if (client.status !== 'ready') {
      switchToMemoryStore();
    }
  }, 3000);
} catch {
  switchToMemoryStore();
}

module.exports = wrapper;
