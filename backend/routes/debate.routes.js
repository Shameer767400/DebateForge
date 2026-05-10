const express = require('express');

const {
  startDebate,
  getDebateHistory,
  getDebateById,
  endDebate,
} = require('../controllers/debate.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// All debate routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/debates/start:
 *   post:
 *     tags: [Debates]
 *     summary: Start a new AI debate session
 *     description: |
 *       Creates a new debate with the specified topic, side, difficulty, persona,
 *       and debate format. Supports preset topics (via topicId) or custom topics.
 *       Returns a debateId used to join the WebSocket debate room.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [side, difficulty]
 *             properties:
 *               topicId:
 *                 type: string
 *                 description: MongoDB ObjectId of a preset topic (mutually exclusive with customTopic)
 *               customTopic:
 *                 type: string
 *                 description: Free-text custom debate topic
 *                 example: "Pineapple belongs on pizza"
 *               side:
 *                 type: string
 *                 enum: [for, against]
 *               difficulty:
 *                 type: string
 *                 enum: [beginner, intermediate, expert, devils_advocate]
 *               persona:
 *                 type: string
 *                 enum: [balanced, socratic, aggressive, academic, casual]
 *                 default: balanced
 *               format:
 *                 type: string
 *                 enum: [freeform, oxford, lincoln_douglas, parliamentary]
 *                 default: freeform
 *     responses:
 *       201:
 *         description: Debate created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 debateId:
 *                   type: string
 *                 topicSnapshot:
 *                   type: string
 *                 userSide:
 *                   type: string
 *                 difficulty:
 *                   type: string
 *                 persona:
 *                   type: string
 *                 format:
 *                   type: string
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Topic not found (when using topicId)
 */
router.post('/start', startDebate);

/**
 * @swagger
 * /api/debates/history:
 *   get:
 *     tags: [Debates]
 *     summary: Get paginated debate history for the current user
 *     description: Returns all debates for the authenticated user, sorted by most recent. Supports pagination.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated list of debates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 debates:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Debate'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 */
router.get('/history', getDebateHistory);

/**
 * @swagger
 * /api/debates/{id}:
 *   get:
 *     tags: [Debates]
 *     summary: Get a specific debate by ID
 *     description: |
 *       Returns the full debate document including all arguments, scores,
 *       fallacy detections, and judge verdict. Only accessible by the debate owner (IDOR prevention).
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Debate MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Full debate document
 *       404:
 *         description: Debate not found or unauthorized
 */
router.get('/:id', getDebateById);

/**
 * @swagger
 * /api/debates/{id}/end:
 *   post:
 *     tags: [Debates]
 *     summary: End a debate early (forfeit)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Debate ended
 *       404:
 *         description: Debate not found
 */
router.post('/:id/end', endDebate);

module.exports = router;
