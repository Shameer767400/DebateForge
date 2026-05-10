'use strict';

/**
 * @fileoverview Debate Engine service — lifecycle management for DebateForge debates.
 *
 * Encapsulates all debate lifecycle operations:
 *   - Create debate sessions with topic resolution
 *   - Finalize debate with ELO calculation
 *   - Achievement checking and awarding
 *   - Score aggregation and winner determination
 *
 * @module services/debateEngine.service
 */

const { User, Topic, Debate } = require('../models');
const { updateStreak } = require('./streak.service');

/** Score thresholds for win/draw/loss determination */
const SCORE_THRESHOLDS = {
  WIN: 65,
  DRAW: 45,
};

/**
 * Create a new debate session.
 *
 * @param {Object} params
 * @param {string} params.userId — MongoDB ObjectId of the user
 * @param {string} [params.topicId] — preset topic ID (optional if customTopic provided)
 * @param {string} [params.customTopic] — custom topic text
 * @param {string} params.side — 'for' or 'against'
 * @param {string} params.difficulty — beginner|intermediate|expert|devils_advocate
 * @param {string} [params.persona] — balanced|socratic|aggressive|academic|casual
 * @param {string} [params.format] — freeform|oxford|lincoln_douglas|parliamentary
 * @returns {Promise<Object>} created debate document
 */
async function createDebate({ userId, topicId, customTopic, side, difficulty, persona, format }) {
  let topicSnapshot;
  let resolvedTopicId = topicId || null;

  if (customTopic && customTopic.trim()) {
    topicSnapshot = customTopic.trim();
  } else {
    const topic = await Topic.findById(topicId);
    if (!topic) throw new Error('Topic not found');
    topicSnapshot = topic.title;
    await Topic.findByIdAndUpdate(topicId, { $inc: { debateCount: 1 } });
  }

  const debate = new Debate({
    userId,
    topicId: resolvedTopicId,
    topicSnapshot,
    userSide: side,
    difficulty: difficulty === 'devil' ? 'devils_advocate' : difficulty,
    persona: persona || 'balanced',
    format: format || 'freeform',
    arguments: [],
  });

  await debate.save();
  return debate;
}

/**
 * Finalize a completed debate — calculate scores, update ELO, award achievements.
 *
 * @param {string} userId
 * @param {string} debateId
 * @param {string} winner — 'user' | 'ai' | 'draw'
 * @param {number} [durationSecs=0]
 * @param {number} [tzOffsetMinutes=0]
 * @returns {Promise<Object>} finalization result
 */
async function finalizeDebate(userId, debateId, winner, durationSecs = 0, tzOffsetMinutes = 0) {
  const debate = await Debate.findOne({ _id: debateId, userId });
  if (!debate) throw new Error('Debate not found');
  if (debate.endedAt) return debate;

  const avgScore = debate.getAverageScore();

  await Debate.findByIdAndUpdate(debateId, {
    winner,
    userFinalScore: avgScore,
    durationSecs,
    endedAt: new Date(),
  });

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // ELO calculation with adaptive K-factor
  const K = user.totalDebates < 10 ? 32 : user.totalDebates < 50 ? 16 : 8;
  const { AI_ELO_RATING } = require('../config/constants');
  const expected = 1 / (1 + Math.pow(10, (AI_ELO_RATING - user.eloRating) / 400));
  const actual = winner === 'user' ? 1 : winner === 'draw' ? 0.5 : 0;
  const newElo = Math.round(user.eloRating + K * (actual - expected));

  const statUpdate = { totalDebates: 1, eloRating: newElo - user.eloRating };
  if (winner === 'user') statUpdate.wins = 1;
  else if (winner === 'ai') statUpdate.losses = 1;
  else if (winner === 'draw') statUpdate.draws = 1;

  await User.findByIdAndUpdate(userId, { $inc: statUpdate });

  // Update fallacy profile
  const fallacyInc = {};
  debate.getUserArguments().forEach((arg) => {
    if (arg.fallacy?.detected && arg.fallacy?.type) {
      const key = `fallacyProfile.${arg.fallacy.type}`;
      fallacyInc[key] = (fallacyInc[key] || 0) + 1;
    }
  });
  if (Object.keys(fallacyInc).length > 0) {
    await User.findByIdAndUpdate(userId, { $inc: fallacyInc });
  }

  // Streak update
  const freshUser = await User.findById(userId);
  const streakResult = updateStreak(freshUser, tzOffsetMinutes);
  freshUser.markModified('streak');
  await freshUser.save();

  return { avgScore, newElo, streakResult, freshUser };
}

/**
 * Get user's debate statistics summary.
 *
 * @param {string} userId
 * @returns {Promise<Object>} stats summary
 */
async function getDebateStats(userId) {
  const [total, wins, losses, draws] = await Promise.all([
    Debate.countDocuments({ userId }),
    Debate.countDocuments({ userId, winner: 'user' }),
    Debate.countDocuments({ userId, winner: 'ai' }),
    Debate.countDocuments({ userId, winner: 'draw' }),
  ]);

  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return { total, wins, losses, draws, winRate };
}

module.exports = {
  createDebate,
  finalizeDebate,
  getDebateStats,
  SCORE_THRESHOLDS,
};
