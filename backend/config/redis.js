const Redis = require('ioredis');

/* ── In-memory fallback used when Redis is unavailable ── */
class MemoryStore {
  constructor() {
    this._store = new Map();
    this._timers = new Map();
  }

  async get(key) {
    return this._store.get(key) ?? null;
  }

  async set(key, value) {
    this._store.set(key, value);
  }

  async setex(key, ttlSeconds, value) {
    this._store.set(key, value);
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

  async zadd(key, score, val) {
    let sortedSet = this._store.get(key);
    if (!sortedSet || !Array.isArray(sortedSet)) {
      sortedSet = [];
      this._store.set(key, sortedSet);
    }
    // Remove if value already exists to ensure uniqueness (standard Redis sorted set behavior)
    sortedSet = sortedSet.filter(item => item.value !== val);
    sortedSet.push({ score: Number(score), value: val });
    // Sort ascending by score
    sortedSet.sort((a, b) => a.score - b.score);
    this._store.set(key, sortedSet);
  }

  async zrangebyscore(key, min, max) {
    const sortedSet = this._store.get(key);
    if (!sortedSet || !Array.isArray(sortedSet)) return [];
    const minVal = min === '-inf' ? -Infinity : Number(min);
    const maxVal = max === '+inf' ? Infinity : Number(max);
    return sortedSet
      .filter(item => item.score >= minVal && item.score <= maxVal)
      .map(item => item.value);
  }

  async zremrangebyscore(key, min, max) {
    const sortedSet = this._store.get(key);
    if (!sortedSet || !Array.isArray(sortedSet)) return 0;
    const minVal = min === '-inf' ? -Infinity : Number(min);
    const maxVal = max === '+inf' ? Infinity : Number(max);
    const initialLength = sortedSet.length;
    const remaining = sortedSet.filter(item => item.score < minVal || item.score > maxVal);
    this._store.set(key, remaining);
    return initialLength - remaining.length;
  }

  async quit() {
    // no-op for memory store
  }
}

/*
 * Proxy wrapper that delegates to whatever the current backing store is.
 *
 * Ensures every call always goes through the current backend, even after
 * a fallback from ioredis to MemoryStore.
 */
const sharedMemoryStore = new MemoryStore();

const wrapper = {
  _backend: null,
  _redisClient: null, // keep reference for graceful shutdown & health checks
  _usingRedis: false,

  async get(key)            { return this._backend.get(key); },
  async set(key, value)     { return this._backend.set(key, value); },
  async setex(key, ttl, val){ return this._backend.setex(key, ttl, val); },
  async del(key)            { return this._backend.del(key); },

  // Sorted Set Operations
  async zadd(key, score, val)                     { return this._backend.zadd ? this._backend.zadd(key, score, val) : null; },
  async zrangebyscore(key, min, max)              { return this._backend.zrangebyscore ? this._backend.zrangebyscore(key, min, max) : []; },
  async zremrangebyscore(key, min, max)           { return this._backend.zremrangebyscore ? this._backend.zremrangebyscore(key, min, max) : null; },

  /** Graceful shutdown — close Redis connection if one exists */
  async disconnect() {
    if (this._redisClient) {
      try {
        await this._redisClient.quit();
      } catch {
        // ignore — we're shutting down
      }
    }
  },

  /** Get the raw ioredis client (for advanced operations like sorted sets) */
  getClient() {
    return this._usingRedis && this._redisClient ? this._redisClient : null;
  },

  /** Health check — returns { connected, using } */
  status() {
    if (this._usingRedis && this._redisClient) {
      return {
        store: 'redis',
        connected: this._redisClient.status === 'ready',
        status: this._redisClient.status,
      };
    }
    return { store: 'memory', connected: true, status: 'ready' };
  },
};

function switchToMemoryStore(reason) {
  if (wrapper._backend !== sharedMemoryStore) {
    console.warn(`⚠️  Redis unavailable (${reason}) — using in-memory session store`);
    wrapper._backend = sharedMemoryStore;
    wrapper._usingRedis = false;
  }
}

try {
  const redisUrl = process.env.REDIS_URL;

  // Quick sanity check: REDIS_URL must look like a URL, not a CLI command
  if (!redisUrl || redisUrl.includes('redis-cli') || (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://'))) {
    if (redisUrl) {
      console.warn('⚠️  REDIS_URL is not a valid connection string. Falling back to in-memory store.');
    }
    throw new Error('Invalid or missing REDIS_URL');
  }

  const client = new Redis(redisUrl, {
    lazyConnect:          true,
    enableOfflineQueue:   false,
    maxRetriesPerRequest: 2,
    connectTimeout:       5000,
    // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, then cap at 5s
    // Keeps retrying indefinitely (returns number, not null) to survive transient outages
    retryStrategy: (times) => {
      if (times > 20) return 5000; // cap at 5s after 20 attempts
      return Math.min(times * 200, 5000);
    },
    // TLS config for rediss:// URLs
    tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  });

  client.on('connect', () => {
    console.log('✅ Redis connected');
    // Switch back to Redis if we had fallen back to memory
    if (wrapper._backend === sharedMemoryStore) {
      wrapper._backend = client;
      wrapper._usingRedis = true;
      console.log('✅ Redis recovered — switched back from in-memory store');
    }
  });

  client.on('error', (err) => {
    // Only log occasionally to avoid flooding
    if (wrapper._usingRedis) {
      console.warn(`⚠️  Redis error: ${err.message}`);
    }
  });

  client.on('close', () => {
    // Switch to memory store on disconnect so the app keeps working
    switchToMemoryStore('connection closed');
  });

  client.connect().catch(() => {});

  wrapper._backend = client;
  wrapper._redisClient = client;
  wrapper._usingRedis = true;

  // If not ready within 5 seconds, fall back to memory
  setTimeout(() => {
    if (client.status !== 'ready') {
      switchToMemoryStore('connection timeout');
    }
  }, 5000);
} catch {
  switchToMemoryStore('init error');
}

module.exports = wrapper;
