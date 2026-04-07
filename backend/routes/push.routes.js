'use strict';

const express = require('express');
const router  = express.Router();
const { User } = require('../models');
const { VAPID_PUBLIC_KEY } = require('../services/push.service');
const { protect } = require('../middleware/auth.middleware');

/* ── Get VAPID public key ── */
router.get('/vapid-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY || '' });
});

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
