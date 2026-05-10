const express = require('express');

const {
  getAllTopics,
  voteOnTopic,
  proposeTopic,
} = require('../controllers/topics.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/topics:
 *   get:
 *     tags: [Topics]
 *     summary: Get all active debate topics
 *     description: Returns curated debate topics organized by category and difficulty.
 *     responses:
 *       200:
 *         description: List of topics
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Topic'
 */
router.get('/', getAllTopics);

/**
 * @swagger
 * /api/topics/vote/{id}:
 *   post:
 *     tags: [Topics]
 *     summary: Vote on a topic (upvote/downvote)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vote:
 *                 type: string
 *                 enum: [up, down]
 *     responses:
 *       200:
 *         description: Vote recorded
 */
router.post('/vote/:id', protect, voteOnTopic);

/**
 * @swagger
 * /api/topics/propose:
 *   post:
 *     tags: [Topics]
 *     summary: Propose a new debate topic
 *     description: Submit a user-proposed topic for community review.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, category]
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Remote work is better than office work"
 *               category:
 *                 type: string
 *                 example: "society"
 *               difficulty:
 *                 type: string
 *                 enum: [easy, medium, hard]
 *     responses:
 *       201:
 *         description: Topic proposed
 */
router.post('/propose', protect, proposeTopic);

module.exports = router;
