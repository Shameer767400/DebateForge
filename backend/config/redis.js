'use strict';

const Redis = require('ioredis');

/* ── In-memory fallback used when Redis is unavailable ── */
class MemoryStore {
  constructor() {
    this._store = new Map();
    this._timers = new Map();
    this._counters = new Map();
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
    if (typeof timer.unref === 'function') timer.unref();
    this._timers.set(key, timer);
  }

  async del(key) {
    if (this._timers.has(key)) clearTimeout(this._timers.get(key));
    this._timers.delete(key);
    this._store.delete(key);
    this._counters.delete(key);
  }

  async incrWindow(key, windowMs) {
    const now = Date.now();
    let entry = this._counters.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
    } else {
      entry.count += 1;
    }
    this._counters.set(key, entry);
    return {
      totalHits: entry.count,
      resetTime: new Date(entry.resetAt),
    };
  }

  async decr(key) {
    const entry = this._counters.get(key);
    if (!entry) return 0;
    if (Date.now() >= entry.resetAt) {
      this._counters.delete(key);
      return 0;
    }
    entry.count = Math.max(0, entry.count - 1);
    if (entry.count === 0) {
      this._counters.delete(key);
    } else {
      this._counters.set(key, entry);
    }
    return entry.count;
  }

  async zadd(key, score, val) {
    let sortedSet = this._store.get(key);
    if (!sortedSet || !Array.isArray(sortedSet)) {
      sortedSet = [];
      this._store.set(key, sortedSet);
    }
    // Remove if value already exists to ensure uniqueness (standard Redis sorted set behavior)
    sortedSet = sortedSet.filter((item) => item.value !== val);
    sortedSet.push({ score: Number(score), value: val });
    sortedSet.sort((a, b) => a.score - b.score);
    this._store.set(key, sortedSet);
  }

  async zrangebyscore(key, min, max) {
    const sortedSet = this._store.get(key);
    if (!sortedSet || !Array.isArray(sortedSet)) return [];
    const minVal = min === '-inf' ? -Infinity : Number(min);
    const maxVal = max === '+inf' ? Infinity : Number(max);
    return sortedSet
      .filter((item) => item.score >= minVal && item.score <= maxVal)
      .map((item) => item.value);
  }

  async zremrangebyscore(key, min, max) {
    const sortedSet = this._store.get(key);
    if (!sortedSet || !Array.isArray(sortedSet)) return 0;
    const minVal = min === '-inf' ? -Infinity : Number(min);
    const maxVal = max === '+inf' ? Infinity : Number(max);
    const initialLength = sortedSet.length;
    const remaining = sortedSet.filter((item) => item.score < minVal || item.score > maxVal);
    this._store.set(key, remaining);
    return initialLength - remaining.length;
  }

  async quit() {
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();
  }
}

const INCR_WINDOW_LUA = `
local hits = redis.call('INCR', KEYS[1])
local pttl = redis.call('PTTL', KEYS[1])
if hits == 1 or pttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return { hits, pttl }
`;

function normalizeRedisUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let url = raw.trim();
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1).trim();
  }
  return url;
}

/*
 * Proxy wrapper that delegates to Redis when ready and falls back transparently
 * to MemoryStore whenever Redis is unconfigured, connecting, or disconnected.
 */
const sharedMemoryStore = new MemoryStore();

let lastWarnAt = 0;
function warnRateLimited(msg) {
  const now = Date.now();
  if (now - lastWarnAt > 15000) {
    lastWarnAt = now;
    // eslint-disable-next-line no-console
    console.warn(msg);
  }
}

function switchToMemoryStore(reason) {
  if (wrapper._usingRedis || wrapper._backend !== sharedMemoryStore) {
    warnRateLimited(`⚠️  Redis unavailable (${reason}) — using in-memory session store`);
    wrapper._backend = sharedMemoryStore;
    wrapper._usingRedis = false;
  }
}

const wrapper = {
  _backend: sharedMemoryStore,
  _redisClient: null,
  _usingRedis: false,

  async _exec(method, args, fallbackValue) {
    if (this._usingRedis && this._redisClient && this._redisClient.status === 'ready') {
      try {
        return await this._redisClient[method](...args);
      } catch (err) {
        switchToMemoryStore(err.message);
      }
    }
    if (typeof sharedMemoryStore[method] === 'function') {
      return sharedMemoryStore[method](...args);
    }
    return fallbackValue;
  },

  async get(key)             { return this._exec('get', [key], null); },
  async set(key, value)      { return this._exec('set', [key, value]); },
  async setex(key, ttl, val) { return this._exec('setex', [key, ttl, val]); },
  async del(key)             { return this._exec('del', [key]); },

  // Sorted Set Operations
  async zadd(key, score, val)           { return this._exec('zadd', [key, score, val], null); },
  async zrangebyscore(key, min, max)    { return this._exec('zrangebyscore', [key, min, max], []); },
  async zremrangebyscore(key, min, max) { return this._exec('zremrangebyscore', [key, min, max], 0); },

  // Atomic fixed-window counter for distributed rate limiting
  async incrWindow(key, windowMs) {
    if (this._usingRedis && this._redisClient && this._redisClient.status === 'ready') {
      try {
        const res = await this._redisClient.eval(INCR_WINDOW_LUA, 1, key, String(windowMs));
        const totalHits = Number(res?.[0]) || 1;
        const pttl = Math.max(Number(res?.[1]) || windowMs, 0);
        return {
          totalHits,
          resetTime: new Date(Date.now() + pttl),
        };
      } catch (err) {
        switchToMemoryStore(`incrWindow error: ${err.message}`);
      }
    }
    return sharedMemoryStore.incrWindow(key, windowMs);
  },

  async decr(key) {
    if (this._usingRedis && this._redisClient && this._redisClient.status === 'ready') {
      try {
        const val = await this._redisClient.decr(key);
        if (val <= 0) await this._redisClient.del(key);
        return val;
      } catch (err) {
        switchToMemoryStore(`decr error: ${err.message}`);
      }
    }
    return sharedMemoryStore.decr(key);
  },

  /** Graceful shutdown — close Redis connection if one exists */
  async disconnect() {
    if (this._redisClient) {
      try {
        await this._redisClient.quit();
      } catch {
        // ignore — we're shutting down
      }
    }
    await sharedMemoryStore.quit();
  },

  /** Get the raw ioredis client when connected and ready */
  getClient() {
    return this._usingRedis && this._redisClient && this._redisClient.status === 'ready'
      ? this._redisClient
      : null;
  },

  /** Health check — returns { store, connected, status } */
  status() {
    if (this._usingRedis && this._redisClient && this._redisClient.status === 'ready') {
      return {
        store: 'redis',
        connected: true,
        status: this._redisClient.status,
      };
    }
    return { store: 'memory', connected: true, status: 'ready' };
  },
};

try {
  const redisUrl = normalizeRedisUrl(process.env.REDIS_URL);

  // Quick sanity check: REDIS_URL must look like a URL, not a CLI command
  if (!redisUrl || redisUrl.includes('redis-cli') || (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://'))) {
    if (redisUrl) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  REDIS_URL is not a valid connection string. Falling back to in-memory store.');
    }
    throw new Error('Invalid or missing REDIS_URL');
  }

  const client = new Redis(redisUrl, {
    lazyConnect:          true,
    enableOfflineQueue:   false,
    maxRetriesPerRequest: 1,
    connectTimeout:       5000,
    keepAlive:            30000,
    noDelay:              true,
    retryStrategy: (times) => Math.min(times * 250, 5000),
    // TLS config for rediss:// URLs (Upstash, Redis Cloud, Render Key-Value)
    tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  });

  // Stay on MemoryStore until 'ready' (after TCP + TLS + AUTH succeed) so boot
  // commands never fail with "Stream isn't writeable and enableOfflineQueue is false".
  client.on('ready', () => {
    const wasMemory = wrapper._backend === sharedMemoryStore && wrapper._redisClient === client;
    wrapper._backend = client;
    wrapper._usingRedis = true;
    // eslint-disable-next-line no-console
    console.log(wasMemory ? '✅ Redis ready' : '✅ Redis recovered');
  });

  client.on('error', (err) => {
    if (wrapper._usingRedis) {
      warnRateLimited(`⚠️  Redis error: ${err.message}`);
    }
  });

  client.on('close', () => {
    switchToMemoryStore('connection closed');
  });

  client.on('end', () => {
    switchToMemoryStore('connection ended');
  });

  wrapper._redisClient = client;
  client.connect().catch(() => {});

  const initialTimer = setTimeout(() => {
    if (client.status !== 'ready') {
      switchToMemoryStore('connection timeout');
    }
  }, 5000);
  if (typeof initialTimer.unref === 'function') initialTimer.unref();
} catch {
  switchToMemoryStore('init error');
}

module.exports = wrapper;
module.exports.MemoryStore = MemoryStore;
module.exports.normalizeRedisUrl = normalizeRedisUrl;
