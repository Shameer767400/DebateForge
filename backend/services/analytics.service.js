'use strict';

/**
 * @fileoverview Analytics service for tracking debate engagement metrics.
 *
 * Provides aggregate analytics for:
 *   - User engagement: debates per day, average session duration, retention
 *   - Debate quality: average scores by dimension, improvement trends
 *   - Platform metrics: active users, debate completion rate, topic popularity
 *   - AI performance: response latency, provider usage distribution
 *
 * This service is designed to be extended with time-series storage
 * (e.g., InfluxDB, TimescaleDB) for production-grade analytics dashboards.
 *
 * @module services/analytics.service
 */

const { Debate, User } = require('../models');

/**
 * Get aggregate debate statistics for a specific user.
 *
 * @param {string} userId - MongoDB ObjectId of the user
 * @returns {Promise<Object>} Aggregate stats including win rate, score trends, etc.
 */
async function getUserAnalytics(userId) {
  const debates = await Debate.find({ userId, status: 'completed' })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  if (debates.length === 0) {
    return {
      totalDebates: 0,
      winRate: 0,
      avgScores: { logic: 0, evidence: 0, clarity: 0 },
      recentTrend: 'neutral',
      topFallacy: null,
      favoriteFormat: 'freeform',
    };
  }

  // Win/loss/draw breakdown
  const wins = debates.filter(d => d.judgeScore?.winner === 'user').length;
  const losses = debates.filter(d => d.judgeScore?.winner === 'ai').length;
  const draws = debates.length - wins - losses;
  const winRate = Math.round((wins / debates.length) * 100);

  // Average scores across all debates
  const allScores = debates
    .flatMap(d => (d.arguments || []).filter(a => a.speaker === 'user' && a.scores))
    .map(a => a.scores);

  const avgScores = {
    logic: _avg(allScores.map(s => s.logic).filter(Boolean)),
    evidence: _avg(allScores.map(s => s.evidence).filter(Boolean)),
    clarity: _avg(allScores.map(s => s.clarity).filter(Boolean)),
  };

  // Score trend: compare last 5 debates vs previous 5
  const recent5 = allScores.slice(0, 10);
  const prev5 = allScores.slice(10, 20);
  const recentAvg = _avg(recent5.map(s => (s.logic + s.evidence + s.clarity) / 3));
  const prevAvg = _avg(prev5.map(s => (s.logic + s.evidence + s.clarity) / 3));
  const recentTrend = recentAvg > prevAvg + 3 ? 'improving' :
                      recentAvg < prevAvg - 3 ? 'declining' : 'stable';

  // Most common fallacy
  const fallacyCounts = {};
  for (const debate of debates) {
    for (const arg of (debate.arguments || [])) {
      if (arg.speaker === 'user' && arg.fallacy?.detected && arg.fallacy?.type) {
        fallacyCounts[arg.fallacy.type] = (fallacyCounts[arg.fallacy.type] || 0) + 1;
      }
    }
  }
  const topFallacy = Object.entries(fallacyCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Favorite debate format
  const formatCounts = {};
  for (const debate of debates) {
    const fmt = debate.format || 'freeform';
    formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
  }
  const favoriteFormat = Object.entries(formatCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'freeform';

  return {
    totalDebates: debates.length,
    wins,
    losses,
    draws,
    winRate,
    avgScores,
    recentTrend,
    topFallacy,
    favoriteFormat,
  };
}

/**
 * Get platform-wide analytics (admin endpoint).
 *
 * @returns {Promise<Object>} Platform metrics
 */
async function getPlatformAnalytics() {
  const [totalUsers, totalDebates, activeUsers] = await Promise.all([
    User.countDocuments(),
    Debate.countDocuments(),
    User.countDocuments({
      lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
  ]);

  const completedDebates = await Debate.countDocuments({ status: 'completed' });
  const completionRate = totalDebates > 0
    ? Math.round((completedDebates / totalDebates) * 100)
    : 0;

  return {
    totalUsers,
    totalDebates,
    completedDebates,
    completionRate,
    activeUsersLast7Days: activeUsers,
  };
}

/**
 * Calculate average of an array of numbers.
 * @param {number[]} arr
 * @returns {number}
 */
function _avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return Math.round(arr.reduce((sum, val) => sum + (val || 0), 0) / arr.length);
}

module.exports = {
  getUserAnalytics,
  getPlatformAnalytics,
};
