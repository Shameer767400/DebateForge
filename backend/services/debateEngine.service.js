'use strict';

/**
 * @fileoverview Debate Engine service
 */

const { User, Topic, Debate } = require('../models');
const { updateStreak } = require('./streak.service');

const SCORE_THRESHOLDS = {
  WIN: 65,
  DRAW: 45,
};

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

async function checkAchievements(userId, user, winner) {
  if (!user) {
    user = await User.findById(userId);
    if (!user) return;
  }
  const achievementsToAdd = [];
  if (user.totalDebates === 1) achievementsToAdd.push('first_debate');
  if (user.wins === 10) achievementsToAdd.push('10_wins');

  const recentDebates = await Debate.find({ userId, userFinalScore: { $ne: null } })
    .sort({ endedAt: -1 }).limit(10);

  const last5 = recentDebates.slice(0, 5);
  if (last5.length > 0) {
    const avgOverall = last5.reduce((sum, d) => sum + (d.userFinalScore || 0), 0) / last5.length;
    if (avgOverall > 80) achievementsToAdd.push('logic_master');
  }

  const evidenceScores = last5.flatMap((d) => d.getUserArguments ? d.getUserArguments() : [])
    .map((a) => a.scores?.evidence).filter((s) => s != null);
  if (evidenceScores.length > 0) {
    const avgEvidence = evidenceScores.reduce((s, v) => s + v, 0) / evidenceScores.length;
    if (avgEvidence > 85) achievementsToAdd.push('evidence_king');
  }

  const last3 = recentDebates.slice(0, 3);
  if (last3.length === 3) {
    const allClean = last3.every((d) => {
      const userArgs = d.getUserArguments ? d.getUserArguments() : [];
      return userArgs.every((a) => !a.fallacy?.detected);
    });
    if (allClean) achievementsToAdd.push('no_fallacy_streak_3');
  }

  if (winner === 'user' && recentDebates.length > 0) {
    const latestDebate = await Debate.findOne({ userId }).sort({ endedAt: -1 });
    if (latestDebate) {
      const userArgs = latestDebate.getUserArguments ? latestDebate.getUserArguments() : [];
      const round3Arg = userArgs.find((a) => a.turnNumber === 3);
      if (round3Arg && (round3Arg.scores?.overall ?? 100) < SCORE_THRESHOLDS.DRAW) {
        achievementsToAdd.push('comeback_king');
      }
    }
  }

  if (achievementsToAdd.length > 0) {
    await User.findByIdAndUpdate(userId, { $addToSet: { achievements: { $each: achievementsToAdd } } });
  }
}

async function finalizeDebate(userId, debateId, winner, durationSecs = 0, tzOffsetMinutes = 0) {
  const debate = await Debate.findOne({ _id: debateId, userId });
  if (!debate) throw new Error('Debate not found');
  if (debate.endedAt) return debate;

  const avgScore = debate.getAverageScore();

  await Debate.findByIdAndUpdate(debateId, {
    winner, userFinalScore: avgScore, durationSecs, endedAt: new Date(),
  });

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

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

  await checkAchievements(userId, user, winner);

  const freshUser = await User.findById(userId);
  const streakResult = updateStreak(freshUser, tzOffsetMinutes);
  freshUser.markModified('streak');
  await freshUser.save();

  return { avgScore, newElo, streakResult, freshUser };
}

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

module.exports = { createDebate, finalizeDebate, getDebateStats, SCORE_THRESHOLDS };
