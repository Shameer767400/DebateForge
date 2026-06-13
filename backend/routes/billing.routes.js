/**
 * @fileoverview billing.routes.js — Stripe billing endpoints
 *
 * Routes:
 *   POST /api/billing/webhook                  — Stripe webhook (raw body, no auth)
 *   POST /api/billing/create-checkout-session  — Start checkout (auth required)
 *   POST /api/billing/create-portal-session    — Open billing portal (auth required)
 *   GET  /api/billing/subscription             — Get plan status (auth required)
 *   POST /api/billing/cancel                   — Cancel at period end (auth required)
 *   POST /api/billing/reactivate               — Undo cancellation (auth required)
 *
 * IMPORTANT: The webhook route uses express.raw() — it must be registered
 * BEFORE express.json() in server.js. This file handles that internally
 * by exporting the raw middleware separately.
 *
 * @module routes/billing.routes
 */

const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const {
  createCheckoutSession,
  createPortalSession,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  handleWebhook,
} = require('../controllers/billing.controller');

const router = express.Router();

/* ── Webhook: raw body required for Stripe signature verification ──
   This route intentionally has NO auth — Stripe calls it directly.
   Security comes from the STRIPE_WEBHOOK_SECRET signature check. */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleWebhook
);

/* ── All routes below require authentication ── */
router.use(protect);

/* Start a Stripe Checkout session */
router.post('/create-checkout-session', createCheckoutSession);

/* Open the Stripe Customer Portal (manage payment methods, invoices, cancel) */
router.post('/create-portal-session', createPortalSession);

/* Get current subscription status + usage */
router.get('/subscription', getSubscription);

/* Cancel subscription at period end */
router.post('/cancel', cancelSubscription);

/* Reactivate a subscription scheduled for cancellation */
router.post('/reactivate', reactivateSubscription);

module.exports = router;
