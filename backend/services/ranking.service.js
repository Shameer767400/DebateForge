'use strict';

/**
 * @fileoverview Ranking service — ELO rating and leaderboard management.
 *
 * Provides ELO calculation, leaderboard queries, and ranking utilities.
 * Uses adaptive K-factor based on total debates played.
 *
 * @module services/ranking.service
 */

const { User } = require('../models');
const { AI_ELO_RATING } = require('../config/constants');

/**
 * Calculate new ELO rating after a debate.
 * @param {number} currentElo
 * @param {number} totalDebates
 * @param {string} result — 'win' | 'loss' | 'draw'
 * @returns {number} new ELO rating
 */
function calculateElo(currentElo, totalDebates, result) {
  const K = totalDebates < 10 ? 32 : totalDebates < 50 ? 16 : 8;
  const expected = 1 / (1 + Math.pow(10, (AI_ELO_RATING - currentElo) / 400));
  const actual = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  return Math.round(currentElo + K * (actual - expected));
}

/**
 * Get global leaderboard.
 * @param {number} [limit=20]
 * @returns {Promise<Object[]>}
 */
async function getLeaderboard(limit = 20) {
  return User.find({ totalDebates: { $gt: 0 } })
    .select('username eloRating wins losses draws totalDebates')
    .sort({ eloRating: -1 })
    .limit(limit)
    .lean();
}

/**
 * Get a user's rank position.
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function getUserRank(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return -1;
  return User.countDocuments({ eloRating: { $gt: user.eloRating } }) + 1;
}

module.exports = { calculateElo, getLeaderboard, getUserRank };
