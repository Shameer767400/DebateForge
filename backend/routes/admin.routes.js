'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const { protect } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const ctrl = require('../controllers/admin.controller');

const router = express.Router();

/* ─────────────────────────────────────────────────────────────
   RATE LIMITER
   200 requests per 15-minute window per IP for all admin routes.
───────────────────────────────────────────────────────────── */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests, please try again later.' },
});

/* ─────────────────────────────────────────────────────────────
   GLOBAL MIDDLEWARE
   Every route below requires a valid JWT and the 'admin' role.
───────────────────────────────────────────────────────────── */
router.use(protect);
router.use(requireRole(['admin']));
router.use(adminLimiter);

/* ══════════════════════════════════════════════
   OVERVIEW
═══════════════════════════════════════════════ */

/**
 * @swagger
 * /api/admin/overview/stats:
 *   get:
 *     tags: [Admin - Overview]
 *     summary: Dashboard KPI statistics
 *     description: |
 *       Returns high-level numbers: total users, total debates, active users
 *       in the last 7 days, new users today, debates started today, completed
 *       debates, completion rate, 30-day user-growth percentage, average
 *       Feedback rating, and total feedback count.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overview statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:        { type: integer }
 *                 totalDebates:      { type: integer }
 *                 activeUsers7d:     { type: integer }
 *                 newUsersToday:     { type: integer }
 *                 debatesToday:      { type: integer }
 *                 completedDebates:  { type: integer }
 *                 completionRate:    { type: number }
 *                 userGrowth:        { type: number, description: "% change vs prev 30 days" }
 *                 avgRating:         { type: number, nullable: true }
 *                 totalFeedback:     { type: integer }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/overview/stats', ctrl.getOverviewStats);

/**
 * @swagger
 * /api/admin/overview/charts:
 *   get:
 *     tags: [Admin - Overview]
 *     summary: Time-series chart data
 *     description: |
 *       Returns four time-series datasets for the selected date range:
 *       daily registrations, daily debate counts, daily average score trends
 *       (logic / evidence / clarity), and format distribution.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: integer
 *           enum: [7, 30, 90]
 *           default: 30
 *         description: Number of days to look back
 *     responses:
 *       200:
 *         description: Chart datasets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 range:               { type: integer }
 *                 registrations:       { type: array, items: { type: object } }
 *                 debatesPerDay:       { type: array, items: { type: object } }
 *                 scoreTrends:         { type: array, items: { type: object } }
 *                 formatDistribution:  { type: array, items: { type: object } }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/overview/charts', ctrl.getOverviewCharts);

/**
 * @swagger
 * /api/admin/overview/recent:
 *   get:
 *     tags: [Admin - Overview]
 *     summary: Most recent users and debates
 *     description: Returns the last 10 registered users and last 10 debates.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recent activity
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recentUsers:   { type: array, items: { type: object } }
 *                 recentDebates: { type: array, items: { type: object } }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/overview/recent', ctrl.getRecentActivity);

/* ══════════════════════════════════════════════
   USERS
═══════════════════════════════════════════════ */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Paginated user list
 *     description: |
 *       Returns a paginated list of users. Sensitive credential fields
 *       (passwordHash, tokens, OTPs, login attempt counters) are excluded.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive regex match on username and email
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, editor, viewer, user] }
 *       - in: query
 *         name: plan
 *         schema: { type: string }
 *         description: Filter by subscription.plan
 *       - in: query
 *         name: verified
 *         schema: { type: boolean }
 *         description: Filter by emailVerified
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: createdAt }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Paginated user list
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/users', ctrl.getUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Get user by ID with debate stats
 *     description: Returns full user profile (minus sensitive fields) plus total debates, win rate, and 5 recent debates.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User profile and debate stats
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 *       404:
 *         description: User not found
 */
router.get('/users/:id', ctrl.getUserById);

/**
 * @swagger
 * /api/admin/users/{id}/role:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Update a user's role
 *     description: |
 *       Changes the role of the target user. Guards:
 *       - Admin cannot change their own role (self-demotion prevention).
 *       - Downgrading the last admin account is blocked.
 *       - Action is written to the security audit log.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, editor, viewer, user]
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Invalid role or last-admin guard
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role or self-change attempt
 *       404:
 *         description: User not found
 */
router.put('/users/:id/role', ctrl.updateUserRole);

/* ══════════════════════════════════════════════
   DEBATES
═══════════════════════════════════════════════ */

/**
 * @swagger
 * /api/admin/debates:
 *   get:
 *     tags: [Admin - Debates]
 *     summary: Paginated debate list
 *     description: Returns all debates (any user) with optional filters. User field populated with username and email.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive regex on topicSnapshot
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [freeform, oxford, lincoln_douglas, parliamentary] }
 *       - in: query
 *         name: difficulty
 *         schema: { type: string, enum: [beginner, intermediate, expert, devils_advocate] }
 *       - in: query
 *         name: winner
 *         schema: { type: string, enum: [user, ai, draw] }
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: startedAt }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Paginated debate list
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/debates', ctrl.getDebates);

/**
 * @swagger
 * /api/admin/debates/analytics:
 *   get:
 *     tags: [Admin - Debates]
 *     summary: Aggregated debate analytics
 *     description: |
 *       Returns totals, win/difficulty/format distributions, top topics,
 *       fallacy frequency, and score histogram for the given date range.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema: { type: string, enum: ["7", "30", "90", "all"], default: "30" }
 *     responses:
 *       200:
 *         description: Analytics data
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/debates/analytics', ctrl.getDebateAnalytics);

/**
 * @swagger
 * /api/admin/debates/{id}:
 *   get:
 *     tags: [Admin - Debates]
 *     summary: Get any debate by ID
 *     description: Returns the full debate document regardless of ownership. userId populated with username and email.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Debate document
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 *       404:
 *         description: Debate not found
 */
router.get('/debates/:id', ctrl.getDebateById);

/* ══════════════════════════════════════════════
   TOPICS
═══════════════════════════════════════════════ */

/**
 * @swagger
 * /api/admin/topics:
 *   get:
 *     tags: [Admin - Topics]
 *     summary: Get all topics (including inactive)
 *     description: Returns every topic in the database, optionally filtered by category, difficulty, or isActive. Sorted by debateCount desc.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [technology, society, politics, education, environment, economy] }
 *       - in: query
 *         name: difficulty
 *         schema: { type: string, enum: [easy, medium, hard] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Array of topics
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/topics', ctrl.getTopics);

/**
 * @swagger
 * /api/admin/topics:
 *   post:
 *     tags: [Admin - Topics]
 *     summary: Create a new topic
 *     description: Validates category and difficulty enums. Sets createdBy to the requesting admin.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, category, difficulty]
 *             properties:
 *               title:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [technology, society, politics, education, environment, economy]
 *               difficulty:
 *                 type: string
 *                 enum: [easy, medium, hard]
 *     responses:
 *       201:
 *         description: Topic created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.post('/topics', ctrl.createTopic);

/**
 * @swagger
 * /api/admin/topics/{id}:
 *   put:
 *     tags: [Admin - Topics]
 *     summary: Update a topic
 *     description: Accepts partial updates for title, category, and difficulty. Validates enums when provided.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:      { type: string }
 *               category:   { type: string }
 *               difficulty: { type: string }
 *     responses:
 *       200:
 *         description: Updated topic
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 *       404:
 *         description: Topic not found
 */
router.put('/topics/:id', ctrl.updateTopic);

/**
 * @swagger
 * /api/admin/topics/{id}/toggle:
 *   patch:
 *     tags: [Admin - Topics]
 *     summary: Toggle topic active status
 *     description: Flips the isActive boolean. Active topics are visible to debaters; inactive topics are hidden.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated topic with new isActive value
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 *       404:
 *         description: Topic not found
 */
router.patch('/topics/:id/toggle', ctrl.toggleTopic);

/* ══════════════════════════════════════════════
   SECURITY
═══════════════════════════════════════════════ */

/**
 * @swagger
 * /api/admin/security/logs:
 *   get:
 *     tags: [Admin - Security]
 *     summary: Paginated security log viewer
 *     description: |
 *       Reads `backend/logs/security.log`, parses JSON lines, and returns
 *       them newest-first with optional filtering by level, category, or
 *       free-text search on the message field. Returns an empty array if
 *       the log file does not yet exist.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: level
 *         schema: { type: string, enum: [INFO, WARN, ALERT, CRITICAL] }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [AUTH, RATE_LIMIT, BOT_DEFENSE, API_ERROR, SUSPICIOUS, SYSTEM] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Substring search on the message field (case-insensitive)
 *     responses:
 *       200:
 *         description: Paginated log entries
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/security/logs', ctrl.getSecurityLogs);

/**
 * @swagger
 * /api/admin/security/summary:
 *   get:
 *     tags: [Admin - Security]
 *     summary: Security event summary
 *     description: |
 *       Counts events from security.log grouped by level and category for the
 *       last 24 hours and last 7 days. Returns zero-filled objects when no
 *       events match a bucket.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary object with last24h and last7d breakdowns
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 last24h:
 *                   type: object
 *                   properties:
 *                     total:      { type: integer }
 *                     byLevel:    { type: object }
 *                     byCategory: { type: object }
 *                 last7d:
 *                   type: object
 *                   properties:
 *                     total:      { type: integer }
 *                     byLevel:    { type: object }
 *                     byCategory: { type: object }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/security/summary', ctrl.getSecuritySummary);

/* ══════════════════════════════════════════════
   SYSTEM
═══════════════════════════════════════════════ */

/**
 * @swagger
 * /api/admin/system/health:
 *   get:
 *     tags: [Admin - System]
 *     summary: System health status
 *     description: |
 *       Aggregates health signals from MongoDB (readyState), Redis (status()),
 *       AI orchestrator (getAIStatus()), and reports server uptime, Node
 *       version, environment, memory usage, and email configuration.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mongodb: { type: object }
 *                 redis:   { type: object }
 *                 ai:      { type: object }
 *                 server:  { type: object }
 *                 email:   { type: object }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/system/health', ctrl.getSystemHealth);

/**
 * @swagger
 * /api/admin/system/ai-metrics:
 *   get:
 *     tags: [Admin - System]
 *     summary: AI provider metrics for the last 24 hours
 *     description: |
 *       Calls timeSeries.getDashboardMetrics(24) for latency, provider
 *       distribution, and fallacy distribution data, then also calls
 *       getAIStatus() for real-time provider state.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI metrics and current provider status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 metrics:       { type: object, nullable: true }
 *                 currentStatus: { type: object }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.get('/system/ai-metrics', ctrl.getAIMetrics);

module.exports = router;
