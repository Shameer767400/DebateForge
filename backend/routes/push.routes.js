'use strict';

/**
 * @fileoverview Push notification routes for DebateForge.
 *
 * @swagger
 * tags:
 *   - name: Push
 *     description: Web Push notification management
 */

const express = require('express');
const router  = express.Router();
const { User } = require('../models');
const { VAPID_PUBLIC_KEY } = require('../services/push.service');
const { protect } = require('../middleware/auth.middleware');

/**
 * @swagger
 * /api/push/vapid-key:
 *   get:
 *     tags: [Push]
 *     summary: Get the VAPID public key for push subscriptions
 *     responses:
 *       200:
 *         description: Returns the VAPID public key
 */
/* ── Get VAPID public key ── */
router.get('/vapid-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY || '' });
});

/**
 * @swagger
 * /api/push/subscribe:
 *   post:
 *     tags: [Push]
 *     summary: Subscribe a user to push notifications
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subscription]
 *             properties:
 *               subscription:
 *                 type: object
 *                 description: Web Push subscription object
 *     responses:
 *       200:
 *         description: Subscribed successfully
 */
/* ── Subscribe to push notifications ── */
router.post('/subscribe', protect, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    await User.findByIdAndUpdate(req.user.id, {
      pushSubscription: subscription,
    });

    res.json({ success: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[PUSH] Subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

/**
 * @swagger
 * /api/push/unsubscribe:
 *   post:
 *     tags: [Push]
 *     summary: Unsubscribe a user from push notifications
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Unsubscribed successfully
 */
/* ── Unsubscribe from push notifications ── */
router.post('/unsubscribe', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      pushSubscription: null,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

module.exports = router;
