'use strict';

/**
 * @fileoverview billing.routes.js — Razorpay billing endpoints
 *
 * Routes:
 *   GET  /api/billing/config                   — Public Razorpay config & plan info (no auth)
 *   POST /api/billing/webhook                  — Razorpay webhook (raw body, no auth)
 *   POST /api/billing/create-order             — Create Razorpay Order (auth required)
 *   POST /api/billing/create-checkout-session  — Backward-compatible alias for create-order (auth required)
 *   POST /api/billing/verify-payment           — Verify payment signature & activate plan (auth required)
 *   GET  /api/billing/subscription             — Get plan status & usage (auth required)
 *   POST /api/billing/cancel                   — Schedule cancellation at period end (auth required)
 *   POST /api/billing/reactivate               — Reactivate plan auto-renew (auth required)
 *
 * @module routes/billing.routes
 */

const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const {
  getBillingConfig,
  createOrder,
  createCheckoutSession,
  verifyPayment,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  handleWebhook,
} = require('../controllers/billing.controller');

const router = express.Router();

/* ── Public endpoints ── */
router.get('/config', getBillingConfig);

/* ── Webhook: raw body required for Razorpay signature verification ──
   This route intentionally has NO auth — Razorpay calls it directly.
   Security comes from the RAZORPAY_WEBHOOK_SECRET signature check. */
router.post(
  '/webhook',
  express.raw({ type: '*/*' }),
  handleWebhook
);

/* ── All routes below require authentication ── */
router.use(protect);

/* Create Razorpay order */
router.post('/create-order', createOrder);

/* Backward-compatibility alias */
router.post('/create-checkout-session', createCheckoutSession);

/* Verify Razorpay payment signature & activate subscription */
router.post('/verify-payment', verifyPayment);

/* Get current subscription status + usage */
router.get('/subscription', getSubscription);

/* Cancel subscription at period end */
router.post('/cancel', cancelSubscription);

/* Reactivate a subscription scheduled for cancellation */
router.post('/reactivate', reactivateSubscription);

module.exports = router;
