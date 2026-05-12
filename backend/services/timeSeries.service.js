'use strict';

/**
 * @fileoverview Time-Series Metrics Service for DebateForge.
 *
 * Records and retrieves timestamped platform metrics using Redis sorted sets.
 * Designed as the foundation for the analytics dashboard roadmap item,
 * providing real-time and historical data for:
 *   - AI provider response latency tracking
 *   - Debate score distribution over time
 *   - User engagement velocity (debates per day)
 *   - Platform health monitoring trends
 *
 * Data Model:
 *   Redis Sorted Set: `ts:{metricName}` with score = Unix timestamp (ms)
 *   Each member is a JSON-encoded data point: { value, metadata, timestamp }
 *
 * Retention:
 *   Automatic TTL-based expiration (configurable, default 30 days).
 *   Old data points are pruned on every write to keep memory bounded.
 *
 * @module services/timeSeries.service
 */

const redisClient = require('../config/redis');

/** Default retention window in milliseconds (30 days) */
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Metric name constants */
const METRICS = {
  AI_LATENCY: 'ts:ai_latency',
  DEBATE_SCORE: 'ts:debate_score',
  DEBATES_PER_DAY: 'ts:debates_per_day',
  ACTIVE_USERS: 'ts:active_users',
  PROVIDER_USAGE: 'ts:provider_usage',
  FALLACY_FREQUENCY: 'ts:fallacy_frequency',
};

/**
 * Record a time-series data point.
 *
 * @param {string} metricName - Metric key (use METRICS constants)
 * @param {number} value - Numeric value to record
 * @param {Object} [metadata={}] - Optional metadata (e.g. { provider: 'groq' })
 * @param {number} [retentionMs=DEFAULT_RETENTION_MS] - Data retention window
 * @returns {Promise<void>}
 */
async function record(metricName, value, metadata = {}, retentionMs = DEFAULT_RETENTION_MS) {
  const client = redisClient.getClient();
  if (!client) return; // Gracefully degrade if Redis is unavailable

  const now = Date.now();
  const dataPoint = JSON.stringify({
    value,
    metadata,
    timestamp: now,
  });

  try {
    // Add data point with timestamp as score for range queries
    await client.zadd(metricName, now, dataPoint);

    // Prune expired data points (older than retention window)
    const cutoff = now - retentionMs;
    await client.zremrangebyscore(metricName, '-inf', cutoff);
  } catch (err) {
    // Non-critical: metrics should never crash the main application
    console.warn(`[TimeSeries] Failed to record ${metricName}:`, err.message); // eslint-disable-line no-console
  }
}

/**
 * Query time-series data points within a time range.
 *
 * @param {string} metricName - Metric key to query
 * @param {number} [startMs] - Start of range (Unix ms). Defaults to 24h ago.
 * @param {number} [endMs] - End of range (Unix ms). Defaults to now.
 * @returns {Promise<Array<{value: number, metadata: Object, timestamp: number}>>}
 */
async function query(metricName, startMs, endMs) {
  const client = redisClient.getClient();
  if (!client) return [];

  const now = Date.now();
  const start = startMs || (now - 24 * 60 * 60 * 1000);
  const end = endMs || now;

  try {
    const raw = await client.zrangebyscore(metricName, start, end);
    return raw.map((item) => {
      try { return JSON.parse(item); } catch { return null; }
    }).filter(Boolean);
  } catch (err) {
    console.warn(`[TimeSeries] Failed to query ${metricName}:`, err.message); // eslint-disable-line no-console
    return [];
  }
}

/**
 * Get aggregated statistics for a metric over a time range.
 *
 * @param {string} metricName - Metric key
 * @param {number} [startMs] - Start of range
 * @param {number} [endMs] - End of range
 * @returns {Promise<{count: number, min: number, max: number, avg: number, sum: number}>}
 */
async function aggregate(metricName, startMs, endMs) {
  const points = await query(metricName, startMs, endMs);
  if (points.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, sum: 0 };
  }

  const values = points.map((p) => p.value);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Math.round((sum / values.length) * 100) / 100,
    sum,
  };
}

/**
 * Record AI provider response latency.
 *
 * @param {string} provider - Provider name (e.g. 'groq', 'openai')
 * @param {number} latencyMs - Response time in milliseconds
 * @param {boolean} success - Whether the request succeeded
 */
async function recordAILatency(provider, latencyMs, success = true) {
  await record(METRICS.AI_LATENCY, latencyMs, { provider, success });
  await record(METRICS.PROVIDER_USAGE, 1, { provider });
}

/**
 * Record a debate score for trend analysis.
 *
 * @param {string} userId - User ID
 * @param {number} score - Overall debate score
 * @param {string} format - Debate format used
 */
async function recordDebateScore(userId, score, format = 'freeform') {
  await record(METRICS.DEBATE_SCORE, score, { userId, format });
}

/**
 * Record a fallacy detection event.
 *
 * @param {string} fallacyType - Type of fallacy detected
 * @param {number} confidence - Detection confidence (0-100)
 */
async function recordFallacy(fallacyType, confidence) {
  await record(METRICS.FALLACY_FREQUENCY, confidence, { type: fallacyType });
}

/**
 * Get a summary of all tracked metrics (for the analytics dashboard).
 *
 * @param {number} [hours=24] - Lookback window in hours
 * @returns {Promise<Object>} Aggregated metrics summary
 */
async function getDashboardMetrics(hours = 24) {
  const startMs = Date.now() - hours * 60 * 60 * 1000;

  const [aiLatency, debateScores, fallacies, providerUsage] = await Promise.all([
    aggregate(METRICS.AI_LATENCY, startMs),
    aggregate(METRICS.DEBATE_SCORE, startMs),
    query(METRICS.FALLACY_FREQUENCY, startMs),
    query(METRICS.PROVIDER_USAGE, startMs),
  ]);

  // Provider usage distribution
  const providerCounts = {};
  for (const point of providerUsage) {
    const name = point.metadata?.provider || 'unknown';
    providerCounts[name] = (providerCounts[name] || 0) + 1;
  }

  // Fallacy distribution
  const fallacyCounts = {};
  for (const point of fallacies) {
    const type = point.metadata?.type || 'unknown';
    fallacyCounts[type] = (fallacyCounts[type] || 0) + 1;
  }

  return {
    period: `${hours}h`,
    aiLatency,
    debateScores,
    providerDistribution: providerCounts,
    fallacyDistribution: fallacyCounts,
  };
}

module.exports = {
  METRICS,
  record,
  query,
  aggregate,
  recordAILatency,
  recordDebateScore,
  recordFallacy,
  getDashboardMetrics,
};
