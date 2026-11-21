'use strict';

/**
 * @fileoverview billing.controller.js — DebateForge Razorpay Billing
 *
 * Handles:
 *   GET  /api/billing/config                   — Public billing config (Key ID, pricing)
 *   POST /api/billing/create-order             — Create Razorpay Order (auth required)
 *   POST /api/billing/create-checkout-session  — Backward-compatible alias for create-order
 *   POST /api/billing/verify-payment           — Verify payment signature & activate subscription
 *   GET  /api/billing/subscription             — Get current plan status & quota
 *   POST /api/billing/cancel                   — Schedule cancellation at period end
 *   POST /api/billing/reactivate               — Undo scheduled cancellation
 *   POST /api/billing/webhook                  — Razorpay webhook (raw body required)
 *
 * @module controllers/billing.controller
 */

const { User, Payment } = require('../models');
const razorpayService = require('../services/razorpay.service');
const secLogger = require('../services/security-logger.service');

const FREE_DEBATE_LIMIT = parseInt(process.env.FREE_DEBATE_LIMIT, 10) || 5;

/* ═══════════════════════════════════════════
   GET /api/billing/config
   — Returns safe public billing configuration
     (Razorpay Key ID, currency, plan pricing).
═══════════════════════════════════════════ */
async function getBillingConfig(req, res) {
  try {
    const keyId = razorpayService.getKeyId();
    const isConfigured = razorpayService.isConfigured();

    return res.status(200).json({
      keyId,
      isConfigured,
      currency: 'INR',
      pricing: razorpayService.PLAN_PRICING,
    });
  } catch (err) {
    console.error('[Billing] getBillingConfig error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve billing configuration' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/billing/create-order
   — Creates a Razorpay Order using trusted server pricing.
═══════════════════════════════════════════ */
async function createOrder(req, res) {
  try {
    if (!razorpayService.isConfigured()) {
      return res.status(503).json({
        error: 'Payment system is temporarily unavailable. Razorpay credentials are not configured.',
      });
    }

    const { planId, billingCycle = 'monthly' } = req.body;

    if (!['pro', 'institution'].includes(planId)) {
      return res.status(400).json({ error: `Invalid plan: ${planId}` });
    }

    if (!['monthly', 'yearly'].includes(billingCycle)) {
      return res.status(400).json({ error: `Invalid billing cycle: ${billingCycle}` });
    }

    const amount = razorpayService.getPlanAmount(planId, billingCycle);
    if (!amount) {
      return res.status(400).json({ error: 'Invalid plan or billing cycle configuration' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Prevent duplicate payment if already active on this plan
    if (
      user.subscription?.plan === planId &&
      user.subscription?.status === 'active' &&
      user.subscription?.currentPeriodEnd &&
      new Date(user.subscription.currentPeriodEnd) > new Date()
    ) {
      return res.status(400).json({
        error: `You already have an active ${planId.toUpperCase()} subscription.`,
        alreadySubscribed: true,
      });
    }

    // Receipt ID for Razorpay (must be <= 40 chars)
    const receipt = `rcpt_${user._id.toString().slice(-8)}_${Date.now().toString().slice(-8)}`;

    const order = await razorpayService.createOrder({
      amount,
      receipt,
      notes: {
        userId: user._id.toString(),
        username: user.username,
        email: user.email,
        planId,
        billingCycle,
      },
    });

    // Record pending transaction in Payment model
    await Payment.create({
      userId: user._id,
      razorpayOrderId: order.id,
      planId,
      billingCycle,
      amount,
      currency: 'INR',
      status: 'created',
      notes: {
        receipt,
        userEmail: user.email,
      },
    });

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayService.getKeyId(),
      planId,
      billingCycle,
      name: 'DebateForge',
      description: `${planId.toUpperCase()} (${billingCycle}) Plan Subscription`,
      prefill: {
        name: user.username || '',
        email: user.email || '',
      },
    });
  } catch (err) {
    console.error('[Billing] createOrder error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create payment order' });
  }
}

/**
 * Backward compatibility alias for createOrder
 */
async function createCheckoutSession(req, res) {
  return createOrder(req, res);
}

/* ═══════════════════════════════════════════
   POST /api/billing/verify-payment
   — Verifies Razorpay HMAC SHA256 signature and
     activates the user's subscription.
═══════════════════════════════════════════ */
async function verifyPayment(req, res) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
      billingCycle = 'monthly',
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification parameters' });
    }

    // 1. Verify cryptographic signature
    const isValid = razorpayService.verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValid) {
      secLogger.logSuspiciousActivity(
        req,
        'Invalid Razorpay payment signature received',
        { orderId: razorpay_order_id, paymentId: razorpay_payment_id }
      );
      return res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
    }

    // 2. Find and update Payment record
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      return res.status(404).json({ error: 'Associated payment order record not found' });
    }

    if (String(payment.userId) !== String(req.user.id)) {
      secLogger.logSuspiciousActivity(
        req,
        'Payment user mismatch in verifyPayment',
        { paymentUserId: payment.userId, requestingUserId: req.user.id }
      );
      return res.status(403).json({ error: 'Unauthorized: Payment does not belong to current user' });
    }

    // Idempotency: if already captured, return success immediately
    if (payment.status === 'captured') {
      const existingUser = await User.findById(req.user.id);
      return res.status(200).json({
        success: true,
        message: 'Payment already verified and subscription is active',
        plan: existingUser.subscription?.plan || payment.planId,
        currentPeriodEnd: existingUser.subscription?.currentPeriodEnd,
      });
    }

    // Optional: fetch payment method detail from Razorpay
    let paymentMethod = null;
    try {
      const rzpPayment = await razorpayService.fetchPayment(razorpay_payment_id);
      paymentMethod = rzpPayment.method || null;
    } catch {
      // non-fatal
    }

    payment.status = 'captured';
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.method = paymentMethod;
    payment.verifiedAt = new Date();
    await payment.save();

    // 3. Activate user subscription
    const targetPlan = planId || payment.planId || 'pro';
    const targetCycle = billingCycle || payment.billingCycle || 'monthly';
    const periodDays = targetCycle === 'yearly' ? 365 : 30;

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + periodDays * 24 * 60 * 60 * 1000);

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        'subscription.plan': targetPlan,
        'subscription.status': 'active',
        'subscription.billingCycle': targetCycle,
        'subscription.currentPeriodStart': startDate,
        'subscription.currentPeriodEnd': endDate,
        'subscription.razorpayPaymentId': razorpay_payment_id,
        'subscription.razorpayOrderId': razorpay_order_id,
        'subscription.cancelAtPeriodEnd': false,
        'subscription.canceledAt': null,
      },
      { new: true }
    );

    secLogger.log({
      level: 'INFO',
      category: 'SYSTEM',
      message: `User ${updatedUser.username} successfully upgraded to ${targetPlan} (${targetCycle}) via Razorpay`,
      actorId: req.user.id,
      ip: req.ip,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully upgraded to ${targetPlan.toUpperCase()}!`,
      plan: targetPlan,
      billingCycle: targetCycle,
      currentPeriodEnd: endDate,
    });
  } catch (err) {
    console.error('[Billing] verifyPayment error:', err);
    return res.status(500).json({ error: 'Failed to verify payment' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/billing/webhook
   — Razorpay webhook endpoint (raw body required).
   — Handles async payment success/failure.
═══════════════════════════════════════════ */
async function handleWebhook(req, res) {
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('[Billing] RAZORPAY_WEBHOOK_SECRET is not configured on server.');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!signature) {
    return res.status(400).json({ error: 'Missing x-razorpay-signature header' });
  }

  // Validate webhook HMAC signature over raw body
  const isValid = razorpayService.verifyWebhookSignature(req.body, signature);
  if (!isValid) {
    console.warn('[Billing] Webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  let event;
  try {
    const rawString = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    event = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawString);
  } catch (parseErr) {
    console.error('[Billing] Webhook JSON parse error:', parseErr.message);
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }

  const eventType = event.event;
  console.log(`[Billing] Razorpay Webhook received: ${eventType}`);

  try {
    switch (eventType) {
      /* ── Payment Captured ── */
      case 'payment.captured': {
        const paymentEntity = event.payload?.payment?.entity;
        if (!paymentEntity) break;

        const orderId = paymentEntity.order_id;
        const paymentId = paymentEntity.id;
        const method = paymentEntity.method;

        if (orderId) {
          const paymentRecord = await Payment.findOne({ razorpayOrderId: orderId });
          if (paymentRecord) {
            paymentRecord.status = 'captured';
            paymentRecord.razorpayPaymentId = paymentId;
            paymentRecord.method = method || paymentRecord.method;
            paymentRecord.verifiedAt = paymentRecord.verifiedAt || new Date();
            await paymentRecord.save();

            // Ensure user subscription is active if not already
            const user = await User.findById(paymentRecord.userId);
            if (user && user.subscription?.status !== 'active') {
              const cycle = paymentRecord.billingCycle || 'monthly';
              const days = cycle === 'yearly' ? 365 : 30;
              const startDate = new Date();
              const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

              await User.findByIdAndUpdate(user._id, {
                'subscription.plan': paymentRecord.planId,
                'subscription.status': 'active',
                'subscription.billingCycle': cycle,
                'subscription.currentPeriodStart': startDate,
                'subscription.currentPeriodEnd': endDate,
                'subscription.razorpayPaymentId': paymentId,
                'subscription.razorpayOrderId': orderId,
                'subscription.cancelAtPeriodEnd': false,
              });
              console.log(`[Billing Webhook] Activated ${paymentRecord.planId} for user ${user._id}`);
            }
          }
        }
        break;
      }

      /* ── Order Paid ── */
      case 'order.paid': {
        const orderEntity = event.payload?.order?.entity;
        if (orderEntity?.id) {
          await Payment.findOneAndUpdate(
            { razorpayOrderId: orderEntity.id },
            { status: 'captured' }
          );
        }
        break;
      }

      /* ── Payment Failed ── */
      case 'payment.failed': {
        const paymentEntity = event.payload?.payment?.entity;
        if (paymentEntity?.order_id) {
          await Payment.findOneAndUpdate(
            { razorpayOrderId: paymentEntity.order_id },
            {
              status: 'failed',
              errorDescription: paymentEntity.error_description || 'Payment failed',
            }
          );
        }
        break;
      }

      default:
        console.log(`[Billing Webhook] Unhandled event: ${eventType}`);
    }
  } catch (err) {
    console.error(`[Billing Webhook] Error processing ${eventType}:`, err.message);
  }

  // Always acknowledge 200 OK so Razorpay doesn't aggressively retry
  return res.status(200).json({ received: true });
}

/* ═══════════════════════════════════════════
   GET /api/billing/subscription
   — Returns the current user's plan, usage,
     and billing details.
═══════════════════════════════════════════ */
async function getSubscription(req, res) {
  try {
    const user = await User.findById(req.user.id).select('subscription freeUsage');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const plan = user.subscription?.plan || 'free';
    const status = user.subscription?.status || 'none';
    const isPaid = ['pro', 'institution', 'enterprise'].includes(plan) &&
                   ['active', 'trialing'].includes(status);

    // Free tier usage (resets monthly)
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const debatesUsed = user.freeUsage?.resetMonth === currentMonth
      ? (user.freeUsage.debatesThisMonth || 0)
      : 0;
    const debatesLimit = isPaid ? null : FREE_DEBATE_LIMIT;

    return res.status(200).json({
      plan,
      status,
      isPaid,
      currency: 'INR',
      billingCycle: user.subscription?.billingCycle || 'monthly',
      currentPeriodEnd: user.subscription?.currentPeriodEnd || null,
      cancelAtPeriodEnd: user.subscription?.cancelAtPeriodEnd || false,
      trialEndsAt: user.subscription?.trialEndsAt || null,
      usage: {
        debatesThisMonth: debatesUsed,
        debatesLimit,
        debatesRemaining: debatesLimit !== null ? Math.max(0, debatesLimit - debatesUsed) : null,
      },
    });
  } catch (err) {
    console.error('[Billing] getSubscription error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch subscription' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/billing/cancel
   — Schedules subscription to end at period end.
═══════════════════════════════════════════ */
async function cancelSubscription(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.subscription?.plan || user.subscription.plan === 'free') {
      return res.status(400).json({ error: 'No active paid subscription to cancel.' });
    }

    await User.findByIdAndUpdate(user._id, {
      'subscription.cancelAtPeriodEnd': true,
      'subscription.canceledAt': new Date(),
    });

    return res.status(200).json({
      message: 'Subscription will not renew after the current period.',
      currentPeriodEnd: user.subscription.currentPeriodEnd,
    });
  } catch (err) {
    console.error('[Billing] cancelSubscription error:', err.message);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/billing/reactivate
   — Undoes scheduled cancellation.
═══════════════════════════════════════════ */
async function reactivateSubscription(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.subscription?.cancelAtPeriodEnd) {
      return res.status(400).json({ error: 'Subscription is not scheduled for cancellation.' });
    }

    await User.findByIdAndUpdate(user._id, {
      'subscription.cancelAtPeriodEnd': false,
      'subscription.canceledAt': null,
    });

    return res.status(200).json({ message: 'Subscription auto-renew reactivated successfully.' });
  } catch (err) {
    console.error('[Billing] reactivateSubscription error:', err.message);
    return res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
}

/* ═══════════════════════════════════════════
   FREE TIER GATE MIDDLEWARE
   — Use on debate creation routes to enforce
     5 debates/month limit for free users.
═══════════════════════════════════════════ */
async function checkDebateQuota(req, res, next) {
  try {
    if (process.env.NODE_ENV === 'test') return next();
    if (!req.user) return next();

    const user = await User.findById(req.user.id).select('subscription freeUsage');
    if (!user) return next();

    const plan = user.subscription?.plan || 'free';
    const status = user.subscription?.status || 'none';
    const isPaid = ['pro', 'institution', 'enterprise'].includes(plan) &&
                   ['active', 'trialing'].includes(status);

    if (isPaid) return next();

    const currentMonth = new Date().toISOString().slice(0, 7);
    const isNewMonth = user.freeUsage?.resetMonth !== currentMonth;

    let updatedUser;
    if (isNewMonth) {
      updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          $or: [
            { 'freeUsage.resetMonth': { $ne: currentMonth } },
            { 'freeUsage.resetMonth': { $exists: false } },
          ],
        },
        {
          $set: {
            'freeUsage.debatesThisMonth': 1,
            'freeUsage.resetMonth': currentMonth,
          },
        },
        { new: true }
      );

      if (!updatedUser) {
        const refetched = await User.findById(user._id).select('freeUsage');
        const debatesUsed = refetched?.freeUsage?.debatesThisMonth || 0;
        if (debatesUsed >= FREE_DEBATE_LIMIT) {
          return res.status(402).json({
            error: `Free plan limit reached. You've used ${debatesUsed}/${FREE_DEBATE_LIMIT} debates this month.`,
            code: 'FREE_LIMIT_REACHED',
            upgradeUrl: '/pricing',
            limit: FREE_DEBATE_LIMIT,
            used: debatesUsed,
          });
        }
        updatedUser = await User.findOneAndUpdate(
          {
            _id: user._id,
            'freeUsage.resetMonth': currentMonth,
            'freeUsage.debatesThisMonth': { $lt: FREE_DEBATE_LIMIT },
          },
          {
            $inc: { 'freeUsage.debatesThisMonth': 1 },
          },
          { new: true }
        );
      }
    } else {
      updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          'freeUsage.resetMonth': currentMonth,
          'freeUsage.debatesThisMonth': { $lt: FREE_DEBATE_LIMIT },
        },
        {
          $inc: { 'freeUsage.debatesThisMonth': 1 },
        },
        { new: true }
      );
    }

    if (!updatedUser) {
      const refetched = await User.findById(user._id).select('freeUsage');
      const debatesUsed = refetched?.freeUsage?.debatesThisMonth || 0;
      return res.status(402).json({
        error: `Free plan limit reached. You've used ${debatesUsed}/${FREE_DEBATE_LIMIT} debates this month.`,
        code: 'FREE_LIMIT_REACHED',
        upgradeUrl: '/pricing',
        limit: FREE_DEBATE_LIMIT,
        used: debatesUsed,
      });
    }

    const currentUsed = updatedUser.freeUsage?.debatesThisMonth || 0;
    req.debateUsage = {
      used: currentUsed,
      limit: FREE_DEBATE_LIMIT,
      remaining: Math.max(0, FREE_DEBATE_LIMIT - currentUsed),
    };

    return next();
  } catch (err) {
    console.error('[Billing] checkDebateQuota error:', err.message);
    return next();
  }
}

module.exports = {
  getBillingConfig,
  createOrder,
  createCheckoutSession,
  verifyPayment,
  handleWebhook,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  checkDebateQuota,
};
