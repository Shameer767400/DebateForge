'use strict';

const redisClient = require('../config/redis');

/**
 * express-rate-limit Store backed by config/redis (Redis when connected,
 * seamless in-memory fallback when Redis is unavailable).
 */
class RedisRateLimitStore {
  constructor(namespace) {
    this.prefix = `rl:${namespace}:`;
    this.localKeys = false;
    this.windowMs = 15 * 60 * 1000;
  }

  init(options) {
    if (options && typeof options.windowMs === 'number') {
      this.windowMs = options.windowMs;
    }
  }

  async increment(key) {
    return redisClient.incrWindow(`${this.prefix}${key}`, this.windowMs);
  }

  async decrement(key) {
    await redisClient.decr(`${this.prefix}${key}`);
  }

  async resetKey(key) {
    await redisClient.del(`${this.prefix}${key}`);
  }
}

function createRateLimitStore(namespace) {
  return new RedisRateLimitStore(namespace);
}

module.exports = { RedisRateLimitStore, createRateLimitStore };
