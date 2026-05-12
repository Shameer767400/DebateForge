const express = require('express');

const {
  getMyProfile,
  getFallacyProfile,
  getLeaderboard,
  uploadProfilePic,
  removeProfilePic,
  updateBio,
} = require('../controllers/profile.controller');
const { protect } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/profile/me:
 *   get:
 *     tags: [Profile]
 *     summary: Get current user's full profile
 *     description: |
 *       Returns comprehensive user profile including ELO rating, win/loss record,
 *       debate statistics, streak info, achievements, fallacy profile, and
 *       per-dimension score averages (logic, evidence, clarity).
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User profile with stats
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.get('/me', protect, getMyProfile);

/**
 * @swagger
 * /api/profile/fallacies:
 *   get:
 *     tags: [Profile]
 *     summary: Get user's fallacy profile
 *     description: Returns a breakdown of logical fallacies the user has committed, with counts per type.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Fallacy frequency data
 */
router.get('/fallacies', protect, getFallacyProfile);

/**
 * @swagger
 * /api/profile/leaderboard:
 *   get:
 *     tags: [Profile]
 *     summary: Get the global ELO leaderboard
 *     description: Returns top users ranked by ELO rating. Supports pagination.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Leaderboard entries
 */
router.get('/leaderboard', protect, getLeaderboard);

/**
 * @swagger
 * /api/profile/avatar:
 *   post:
 *     tags: [Profile]
 *     summary: Upload a profile picture
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded
 *   delete:
 *     tags: [Profile]
 *     summary: Remove profile picture
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Avatar removed
 */
router.post('/avatar', protect, uploadProfilePic);
router.delete('/avatar', protect, removeProfilePic);

/**
 * @swagger
 * /api/profile/bio:
 *   put:
 *     tags: [Profile]
 *     summary: Update user bio
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bio:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Bio updated
 */
router.put('/bio', protect, updateBio);

/**
 * @swagger
 * /api/profile/admin/system-stats:
 *   get:
 *     tags: [Admin]
 *     summary: Get system statistics (Admin only)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: System statistics
 */
router.get('/admin/system-stats', protect, requireRole(['admin']), (req, res) => {
  res.json({ message: 'Admin access granted', status: 'healthy' });
});

module.exports = router;
