'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { User, Debate, Topic, Feedback } = require('../models');
const secLogger = require('../services/security-logger.service');
const timeSeries = require('../services/timeSeries.service');
const { getAIStatus } = require('../services/aiOrchestrator.service');
const redisClient = require('../config/redis');

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

/** Fields to exclude from every user query to protect credentials. */
const SENSITIVE_USER_FIELDS =
  '-passwordHash -passwordResetToken -passwordResetExpires ' +
  '-emailVerificationOTP -emailVerificationOTPExpires -loginAttempts -lockUntil';

/** Valid enum values for Topic */
const TOPIC_CATEGORIES = ['technology', 'society', 'politics', 'education', 'environment', 'economy'];
const TOPIC_DIFFICULTIES = ['easy', 'medium', 'hard'];
const VALID_ROLES = ['admin', 'editor', 'viewer', 'user'];

/** Returns a Date object `days` ago from now. */
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** Clamp an integer between min and max. */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, parseInt(val, 10) || min));
}

/* ─────────────────────────────────────────────────────────────
   OVERVIEW
───────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/overview/stats
 * Returns high-level dashboard KPIs.
 */
async function getOverviewStats(req, res) {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = daysAgo(7);
    const thirtyDaysAgo = daysAgo(30);
    const sixtyDaysAgo = daysAgo(60);

    const [
      totalUsers,
      totalDebates,
      activeUsers7d,
      newUsersToday,
      debatesToday,
      completedDebates,
      prevPeriodUsers,
      currentPeriodUsers,
      feedbackStats,
    ] = await Promise.all([
      User.countDocuments(),
      Debate.countDocuments(),
      User.countDocuments({ lastActive: { $gte: sevenDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: startOfToday } }),
      Debate.countDocuments({ startedAt: { $gte: startOfToday } }),
      Debate.countDocuments({ endedAt: { $ne: null } }),
      // users created in the previous 30-day window
      User.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
      // users created in the current 30-day window
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Feedback.aggregate([
        { $match: { isHidden: false } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, total: { $sum: 1 } } },
      ]),
    ]);

    const completionRate = totalDebates > 0 ? ((completedDebates / totalDebates) * 100).toFixed(1) : 0;
    const userGrowth =
      prevPeriodUsers > 0
        ? (((currentPeriodUsers - prevPeriodUsers) / prevPeriodUsers) * 100).toFixed(1)
        : currentPeriodUsers > 0
        ? 100
        : 0;

    const avgRating = feedbackStats.length > 0 ? parseFloat(feedbackStats[0].avgRating.toFixed(2)) : null;
    const totalFeedback = feedbackStats.length > 0 ? feedbackStats[0].total : 0;

    return res.status(200).json({
      totalUsers,
      totalDebates,
      activeUsers7d,
      newUsersToday,
      debatesToday,
      completedDebates,
      completionRate: parseFloat(completionRate),
      userGrowth: parseFloat(userGrowth),
      avgRating,
      totalFeedback,
    });
  } catch (err) {
    console.error('[admin] getOverviewStats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/admin/overview/charts?range=7|30|90
 * Returns time-series chart data for the dashboard.
 */
async function getOverviewCharts(req, res) {
  try {
    const range = parseInt(req.query.range, 10);
    const days = [7, 30, 90].includes(range) ? range : 30;
    const since = daysAgo(days);

    const dateToString = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    const startedAtStr = { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } };

    const [registrations, debatesPerDay, scoreTrends, formatDistribution] = await Promise.all([
      // Registrations grouped by day
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: dateToString, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),

      // Debates started per day
      Debate.aggregate([
        { $match: { startedAt: { $gte: since } } },
        { $group: { _id: startedAtStr, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),

      // Average logic/evidence/clarity scores per day (user turns only)
      Debate.aggregate([
        { $match: { startedAt: { $gte: since } } },
        { $unwind: '$arguments' },
        {
          $match: {
            'arguments.speaker': 'user',
            'arguments.scores': { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: startedAtStr,
            logic: { $avg: '$arguments.scores.logic' },
            evidence: { $avg: '$arguments.scores.evidence' },
            clarity: { $avg: '$arguments.scores.clarity' },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: '$_id',
            logic: { $round: ['$logic', 1] },
            evidence: { $round: ['$evidence', 1] },
            clarity: { $round: ['$clarity', 1] },
          },
        },
      ]),

      // Format distribution over the period
      Debate.aggregate([
        { $match: { startedAt: { $gte: since } } },
        { $group: { _id: '$format', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, format: '$_id', count: 1 } },
      ]),
    ]);

    return res.status(200).json({
      range: days,
      registrations,
      debatesPerDay,
      scoreTrends,
      formatDistribution,
    });
  } catch (err) {
    console.error('[admin] getOverviewCharts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/admin/overview/recent
 * Returns the most recent users and debates.
 */
async function getRecentActivity(req, res) {
  try {
    const [recentUsers, recentDebates] = await Promise.all([
      User.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('username email createdAt emailVerified'),

      Debate.find()
        .sort({ startedAt: -1 })
        .limit(10)
        .select('topicSnapshot format difficulty winner userFinalScore startedAt userId')
        .populate('userId', 'username'),
    ]);

    return res.status(200).json({ recentUsers, recentDebates });
  } catch (err) {
    console.error('[admin] getRecentActivity error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ─────────────────────────────────────────────────────────────
   USERS
───────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/users
 * Paginated, filterable user list.
 */
async function getUsers(req, res) {
  try {
    const page = clamp(req.query.page, 1, Infinity) || 1;
    const limit = clamp(req.query.limit, 1, 100) || 20;
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.search) {
      const regex = new RegExp(req.query.search, 'i');
      filter.$or = [{ username: regex }, { email: regex }];
    }
    if (req.query.role) filter.role = req.query.role;
    if (req.query.plan) filter['subscription.plan'] = req.query.plan;
    if (req.query.verified !== undefined) {
      filter.emailVerified = req.query.verified === 'true';
    }

    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortOrder };

    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).select(SENSITIVE_USER_FIELDS),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[admin] getUsers error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/admin/users/:id
 * Full user profile + debate stats for a specific user.
 */
async function getUserById(req, res) {
  try {
    const user = await User.findById(req.params.id).select(SENSITIVE_USER_FIELDS);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [totalDebates, wins, recentDebates] = await Promise.all([
      Debate.countDocuments({ userId: user._id }),
      Debate.countDocuments({ userId: user._id, winner: 'user' }),
      Debate.find({ userId: user._id })
        .sort({ startedAt: -1 })
        .limit(5)
        .select('topicSnapshot format difficulty winner userFinalScore startedAt endedAt'),
    ]);

    const winRate = totalDebates > 0 ? parseFloat(((wins / totalDebates) * 100).toFixed(1)) : 0;

    return res.status(200).json({
      user,
      debateStats: {
        totalDebates,
        wins,
        winRate,
        recentDebates,
      },
    });
  } catch (err) {
    console.error('[admin] getUserById error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/admin/users/:id/role
 * Update a user's role. Admin-safe: cannot self-demote, cannot remove last admin.
 */
async function updateUserRole(req, res) {
  try {
    const { role } = req.body;

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    // Prevent self-demotion
    if (req.params.id === String(req.user.id)) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    const targetUser = await User.findById(req.params.id).select('role username email');
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // If downgrading an admin, make sure at least one admin remains
    if (targetUser.role === 'admin' && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin account' });
      }
    }

    const prevRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    // Audit log
    secLogger.log({
      level: 'INFO',
      category: 'AUTH',
      message: `Admin role change: ${targetUser.username} ${prevRole} → ${role}`,
      ip: req.ip,
      actorId: req.user.id,
      actorUsername: req.user.username,
      targetId: targetUser._id,
      targetUsername: targetUser.username,
      prevRole,
      newRole: role,
    });

    return res.status(200).json({
      message: 'Role updated successfully',
      user: { id: targetUser._id, username: targetUser.username, email: targetUser.email, role },
    });
  } catch (err) {
    console.error('[admin] updateUserRole error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ─────────────────────────────────────────────────────────────
   DEBATES
───────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/debates
 * Paginated debate list with optional filters.
 */
async function getDebates(req, res) {
  try {
    const page = clamp(req.query.page, 1, Infinity) || 1;
    const limit = clamp(req.query.limit, 1, 100) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.search) filter.topicSnapshot = new RegExp(req.query.search, 'i');
    if (req.query.format) filter.format = req.query.format;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.winner) filter.winner = req.query.winner;

    const sortField = req.query.sort || 'startedAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    const [debates, total] = await Promise.all([
      Debate.find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username email'),
      Debate.countDocuments(filter),
    ]);

    return res.status(200).json({
      debates,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[admin] getDebates error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/admin/debates/analytics?range=7|30|90|all
 * Aggregated debate analytics.
 */
async function getDebateAnalytics(req, res) {
  try {
    const rangeParam = req.query.range;
    const matchStage = {};

    if (rangeParam !== 'all') {
      const days = [7, 30, 90].includes(parseInt(rangeParam, 10)) ? parseInt(rangeParam, 10) : 30;
      matchStage.startedAt = { $gte: daysAgo(days) };
    }

    const baseMatch = Object.keys(matchStage).length ? [{ $match: matchStage }] : [];

    const [
      totalsResult,
      winDistResult,
      difficultyDist,
      formatDist,
      topTopics,
      fallacyDist,
      scoreDist,
    ] = await Promise.all([
      // Totals: count, completed, avgDuration, avgScore
      Debate.aggregate([
        ...baseMatch,
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $ne: ['$endedAt', null] }, 1, 0] } },
            avgDuration: { $avg: '$durationSecs' },
            avgScore: { $avg: '$userFinalScore' },
          },
        },
      ]),

      // Win distribution
      Debate.aggregate([
        ...baseMatch,
        { $match: { winner: { $in: ['user', 'ai', 'draw'] } } },
        { $group: { _id: '$winner', count: { $sum: 1 } } },
      ]),

      // Difficulty distribution
      Debate.aggregate([
        ...baseMatch,
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, difficulty: '$_id', count: 1 } },
      ]),

      // Format distribution
      Debate.aggregate([
        ...baseMatch,
        { $group: { _id: '$format', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, format: '$_id', count: 1 } },
      ]),

      // Top 10 topics by debate count
      Debate.aggregate([
        ...baseMatch,
        { $group: { _id: '$topicSnapshot', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, topicSnapshot: '$_id', count: 1 } },
      ]),

      // Fallacy distribution from embedded arguments
      Debate.aggregate([
        ...baseMatch,
        { $unwind: '$arguments' },
        { $match: { 'arguments.fallacy.detected': true } },
        { $group: { _id: '$arguments.fallacy.type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, type: '$_id', count: 1 } },
      ]),

      // Score distribution histogram (0-10, 11-20, ..., 91-100)
      Debate.aggregate([
        ...baseMatch,
        { $match: { userFinalScore: { $ne: null } } },
        {
          $bucket: {
            groupBy: '$userFinalScore',
            boundaries: [0, 11, 21, 31, 41, 51, 61, 71, 81, 91, 101],
            default: 'Other',
            output: { count: { $sum: 1 } },
          },
        },
        {
          $project: {
            _id: 0,
            bucket: {
              $switch: {
                branches: [
                  { case: { $eq: ['$_id', 0] }, then: '0-10' },
                  { case: { $eq: ['$_id', 11] }, then: '11-20' },
                  { case: { $eq: ['$_id', 21] }, then: '21-30' },
                  { case: { $eq: ['$_id', 31] }, then: '31-40' },
                  { case: { $eq: ['$_id', 41] }, then: '41-50' },
                  { case: { $eq: ['$_id', 51] }, then: '51-60' },
                  { case: { $eq: ['$_id', 61] }, then: '61-70' },
                  { case: { $eq: ['$_id', 71] }, then: '71-80' },
                  { case: { $eq: ['$_id', 81] }, then: '81-90' },
                  { case: { $eq: ['$_id', 91] }, then: '91-100' },
                ],
                default: 'Other',
              },
            },
            count: 1,
          },
        },
      ]),
    ]);

    // Shape totals
    const rawTotals = totalsResult[0] || { total: 0, completed: 0, avgDuration: 0, avgScore: 0 };
    const totals = {
      total: rawTotals.total,
      completed: rawTotals.completed,
      avgDuration: rawTotals.avgDuration ? parseFloat(rawTotals.avgDuration.toFixed(1)) : 0,
      avgScore: rawTotals.avgScore ? parseFloat(rawTotals.avgScore.toFixed(1)) : 0,
    };

    // Shape win distribution
    const winDistribution = { user: 0, ai: 0, draw: 0 };
    for (const { _id, count } of winDistResult) {
      if (_id in winDistribution) winDistribution[_id] = count;
    }

    return res.status(200).json({
      range: rangeParam || '30',
      totals,
      winDistribution,
      difficultyDistribution: difficultyDist,
      formatDistribution: formatDist,
      topTopics,
      fallacyDistribution: fallacyDist,
      scoreDistribution: scoreDist,
    });
  } catch (err) {
    console.error('[admin] getDebateAnalytics error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/admin/debates/:id
 * Admin view of any single debate (bypasses userId ownership check).
 */
async function getDebateById(req, res) {
  try {
    const debate = await Debate.findById(req.params.id).populate('userId', 'username email');
    if (!debate) return res.status(404).json({ error: 'Debate not found' });
    return res.status(200).json({ debate });
  } catch (err) {
    console.error('[admin] getDebateById error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ─────────────────────────────────────────────────────────────
   TOPICS
───────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/topics
 * Returns all topics (including inactive), with optional filters.
 */
async function getTopics(req, res) {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

    const topics = await Topic.find(filter)
      .sort({ debateCount: -1 })
      .populate('createdBy', 'username');

    return res.status(200).json({ topics });
  } catch (err) {
    console.error('[admin] getTopics error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/admin/topics
 * Create a new topic.
 */
async function createTopic(req, res) {
  try {
    const { title, category, difficulty } = req.body;

    if (!title || !category || !difficulty) {
      return res.status(400).json({ error: 'title, category and difficulty are required' });
    }
    if (!TOPIC_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${TOPIC_CATEGORIES.join(', ')}` });
    }
    if (!TOPIC_DIFFICULTIES.includes(difficulty)) {
      return res.status(400).json({ error: `difficulty must be one of: ${TOPIC_DIFFICULTIES.join(', ')}` });
    }

    const topic = await Topic.create({ title, category, difficulty, createdBy: req.user.id });
    return res.status(201).json({ topic });
  } catch (err) {
    console.error('[admin] createTopic error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/admin/topics/:id
 * Partially update a topic's title, category, or difficulty.
 */
async function updateTopic(req, res) {
  try {
    const { title, category, difficulty } = req.body;
    const updates = {};

    if (title !== undefined) updates.title = title;

    if (category !== undefined) {
      if (!TOPIC_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${TOPIC_CATEGORIES.join(', ')}` });
      }
      updates.category = category;
    }

    if (difficulty !== undefined) {
      if (!TOPIC_DIFFICULTIES.includes(difficulty)) {
        return res.status(400).json({ error: `difficulty must be one of: ${TOPIC_DIFFICULTIES.join(', ')}` });
      }
      updates.difficulty = difficulty;
    }

    const topic = await Topic.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    return res.status(200).json({ topic });
  } catch (err) {
    console.error('[admin] updateTopic error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PATCH /api/admin/topics/:id/toggle
 * Flip the isActive boolean on a topic.
 */
async function toggleTopic(req, res) {
  try {
    const topic = await Topic.findById(req.params.id);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    topic.isActive = !topic.isActive;
    await topic.save();

    return res.status(200).json({ topic });
  } catch (err) {
    console.error('[admin] toggleTopic error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ─────────────────────────────────────────────────────────────
   SECURITY LOGS
───────────────────────────────────────────────────────────── */

const SECURITY_LOG_PATH = path.join(__dirname, '..', 'logs', 'security.log');

/** Read and parse all log lines from the security log file. Returns array (newest-first). */
function readSecurityLogLines() {
  if (!fs.existsSync(SECURITY_LOG_PATH)) return [];

  const content = fs.readFileSync(SECURITY_LOG_PATH, 'utf8');
  const lines = content.split('\n').filter(Boolean);

  const parsed = [];
  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      if (item && typeof item === 'object') {
        // Normalise any historical log lines where an object was stored under level
        if (item.level && typeof item.level === 'object') {
          const nested = item.level;
          parsed.push({
            timestamp: item.timestamp || nested.timestamp || new Date().toISOString(),
            level: typeof nested.level === 'string' ? nested.level : 'INFO',
            category: typeof nested.category === 'string' ? nested.category : (item.category || 'SYSTEM'),
            message: typeof nested.message === 'string' ? nested.message : (item.message || '—'),
            ip: nested.ip || item.ip || '—',
            ...nested,
          });
        } else {
          parsed.push(item);
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  // Most recent first
  return parsed.reverse();
}

/**
 * GET /api/admin/security/logs
 * Paginated, filterable security log viewer.
 */
async function getSecurityLogs(req, res) {
  try {
    const page = clamp(req.query.page, 1, Infinity) || 1;
    const limit = clamp(req.query.limit, 1, 500) || 50;

    let logs = readSecurityLogLines();

    // Filter
    if (req.query.level) logs = logs.filter(l => l.level === req.query.level);
    if (req.query.category) logs = logs.filter(l => l.category === req.query.category);
    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      logs = logs.filter(l => l.message && l.message.toLowerCase().includes(q));
    }

    const total = logs.length;
    const paginated = logs.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      logs: paginated,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[admin] getSecurityLogs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/admin/security/summary
 * Counts events by level and category for last 24 h and last 7 days.
 */
async function getSecuritySummary(req, res) {
  try {
    const all = readSecurityLogLines(); // already newest-first
    const now = Date.now();
    const ms24h = 24 * 60 * 60 * 1000;
    const ms7d = 7 * 24 * 60 * 60 * 1000;

    const LEVELS = ['INFO', 'WARN', 'ALERT', 'CRITICAL'];
    const CATEGORIES = ['AUTH', 'RATE_LIMIT', 'BOT_DEFENSE', 'API_ERROR', 'SUSPICIOUS', 'SYSTEM'];

    function summarise(entries) {
      const byLevel = Object.fromEntries(LEVELS.map(l => [l, 0]));
      const byCategory = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
      for (const e of entries) {
        if (e.level && e.level in byLevel) byLevel[e.level]++;
        if (e.category && e.category in byCategory) byCategory[e.category]++;
      }
      return { total: entries.length, byLevel, byCategory };
    }

    const logs24h = all.filter(e => {
      const ts = e.timestamp ? new Date(e.timestamp).getTime() : 0;
      return now - ts <= ms24h;
    });

    const logs7d = all.filter(e => {
      const ts = e.timestamp ? new Date(e.timestamp).getTime() : 0;
      return now - ts <= ms7d;
    });

    return res.status(200).json({
      last24h: summarise(logs24h),
      last7d: summarise(logs7d),
    });
  } catch (err) {
    console.error('[admin] getSecuritySummary error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ─────────────────────────────────────────────────────────────
   SYSTEM HEALTH
───────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/system/health
 * Aggregates health signals from all major subsystems.
 */
async function getSystemHealth(req, res) {
  try {
    const [aiStatus, redisStatus] = await Promise.all([
      (async () => {
        try { return await getAIStatus(); } catch { return { error: 'unavailable' }; }
      })(),
      (async () => {
        try { return redisClient.status(); } catch { return { error: 'unavailable' }; }
      })(),
    ]);

    const mongoStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const mongoReadyState = mongoose.connection.readyState;

    return res.status(200).json({
      mongodb: {
        readyState: mongoReadyState,
        status: mongoStates[mongoReadyState] || 'unknown',
        connected: mongoReadyState === 1,
      },
      redis: redisStatus,
      ai: aiStatus,
      server: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        memory: process.memoryUsage(),
      },
      email: {
        provider: process.env.RESEND_API_KEY ? 'resend' : 'smtp',
        configured: Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
      },
    });
  } catch (err) {
    console.error('[admin] getSystemHealth error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/admin/system/ai-metrics
 * Returns AI latency, provider stats, and fallacy distribution for last 24 h.
 */
async function getAIMetrics(req, res) {
  try {
    const [metrics, aiStatus] = await Promise.all([
      (async () => {
        try { return await timeSeries.getDashboardMetrics(24); } catch { return null; }
      })(),
      (async () => {
        try { return await getAIStatus(); } catch { return { error: 'unavailable' }; }
      })(),
    ]);

    return res.status(200).json({
      metrics,
      currentStatus: aiStatus,
    });
  } catch (err) {
    console.error('[admin] getAIMetrics error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ─────────────────────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────────────────────── */

module.exports = {
  // Overview
  getOverviewStats,
  getOverviewCharts,
  getRecentActivity,
  // Users
  getUsers,
  getUserById,
  updateUserRole,
  // Debates
  getDebates,
  getDebateAnalytics,
  getDebateById,
  // Topics
  getTopics,
  createTopic,
  updateTopic,
  toggleTopic,
  // Security
  getSecurityLogs,
  getSecuritySummary,
  // System
  getSystemHealth,
  getAIMetrics,
};
