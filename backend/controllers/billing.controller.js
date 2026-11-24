'use strict';

/**
 * @fileoverview billing.controller.js — DebateForge Razorpay Prepaid Billing
 *
 * Handles:
 *   GET  /api/billing/config                   — Public billing config (Key ID, pricing)
 *   POST /api/billing/create-order             — Create Razorpay Order (auth required)
 *   POST /api/billing/create-checkout-session  — Backward-compatible alias for create-order
 *   POST /api/billing/verify-payment           — Verify payment signature & activate prepaid access
 *   GET  /api/billing/subscription             — Get current plan status & quota (real-time expiry aware)
 *   POST /api/billing/cancel                   — Prepaid pass cancellation status notice
 *   POST /api/billing/reactivate               — Prepaid pass reactivation status notice
 *   POST /api/billing/webhook                  — Razorpay webhook (raw body required)
 *
 * @module controllers/billing.controller
 */

const mongoose = require('mongoose');
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
   — Supports early renewal for the same plan.
   — Prevents overwriting an active pass with a different tier.
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

    if (!['daily', 'monthly', 'yearly'].includes(billingCycle)) {
      return res.status(400).json({ error: `Invalid billing cycle: ${billingCycle}` });
    }

    const amount = razorpayService.getPlanAmount(planId, billingCycle);
    if (!amount) {
      return res.status(400).json({ error: 'Invalid plan or billing cycle configuration' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const hasActivePass =
      user.subscription?.status === 'active' &&
      user.subscription?.currentPeriodEnd &&
      new Date(user.subscription.currentPeriodEnd) > now;

    // Cross-tier safety: prevent purchasing a different tier while an active pass is running,
    // protecting existing paid time from being discarded or improperly converted.
    if (
      hasActivePass &&
      user.subscription?.plan &&
      user.subscription.plan !== 'free' &&
      user.subscription.plan !== planId
    ) {
      return res.status(400).json({
        error: `You currently have an active ${user.subscription.plan.toUpperCase()} pass valid until ${new Date(user.subscription.currentPeriodEnd).toLocaleDateString()}. Cross-tier changes cannot overwrite an existing active pass. Please wait until your current pass expires or contact support.`,
        activePlan: user.subscription.plan,
        currentPeriodEnd: user.subscription.currentPeriodEnd,
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
      entitlementApplied: false,
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
      description:
        billingCycle === 'daily'
          ? 'DebateForge 24-Hour Pass'
          : `${planId.toUpperCase()} (${billingCycle}) Prepaid Access Pass`,
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
   SHARED ENTITLEMENT APPLICATION FUNCTION
   — Reused by verifyPayment, handleWebhook, and reconcileOrphanedPayments.
   — ACID Multi-Document Transaction: User entitlement and Payment finalization
     commit or roll back together.
   — Robust retry handling for TransientTransactionError and UnknownTransactionCommitResult.
   — Formula: newExpiry = max(existingValidExpiry, paymentTime) + purchasedDuration
═══════════════════════════════════════════ */
async function applyPaymentEntitlement({
  payment,
  razorpayPaymentId,
  razorpaySignature,
  paymentMethod,
}) {
  // 1. Fast durable idempotency check: if entitlement was already applied to the user, avoid re-processing
  if (payment.entitlementApplied && payment.status === 'captured') {
    const user = await User.findById(payment.userId);
    return { success: true, alreadyApplied: true, user, payment };
  }

  const session = await mongoose.startSession();
  const MAX_TX_RETRIES = 3;
  let attempt = 0;
  let result = null;

  try {
    while (attempt < MAX_TX_RETRIES) {
      attempt++;
      try {
        await session.withTransaction(
          async () => {
            // Helper to execute findById with session support
            const findWithSession = async (model, id) => {
              let q = model.findById(id);
              if (q && typeof q.session === 'function') {
                q = q.session(session);
              }
              return await q;
            };

            // A. Durable Idempotency Check inside transaction snapshot
            const txPayment = await findWithSession(Payment, payment._id);
            if (!txPayment) {
              throw new Error(`Payment record ${payment._id} not found in transaction`);
            }

            if (txPayment.entitlementApplied && txPayment.status === 'captured') {
              const currentUser = await findWithSession(User, txPayment.userId);
              result = { success: true, alreadyApplied: true, user: currentUser, payment: txPayment };
              return;
            }

            // B. Fetch latest User document inside snapshot
            const txUser = await findWithSession(User, txPayment.userId);
            if (!txUser) {
              throw new Error(`User ${txPayment.userId} not found during entitlement activation`);
            }

            // C. Additional Idempotency Safeguard: check appliedOrderIds
            if (txUser.subscription?.appliedOrderIds?.includes(txPayment.razorpayOrderId)) {
              const finalizedPayment = await Payment.findByIdAndUpdate(
                txPayment._id,
                {
                  $set: {
                    status: 'captured',
                    entitlementApplied: true,
                    razorpayPaymentId: razorpayPaymentId || txPayment.razorpayPaymentId,
                    razorpaySignature: razorpaySignature || txPayment.razorpaySignature,
                    method: paymentMethod || txPayment.method,
                    verifiedAt: txPayment.verifiedAt || new Date(),
                  },
                },
                { session, new: true }
              );
              result = { success: true, alreadyApplied: true, user: txUser, payment: finalizedPayment };
              return;
            }

            // D. Authoritative Payment Timestamp and Expiry Calculation
            const paymentTime = new Date(txPayment.verifiedAt || txPayment.createdAt || Date.now()).getTime();
            const periodDays =
              txPayment.billingCycle === 'yearly'
                ? 365
                : txPayment.billingCycle === 'daily'
                ? 1
                : 30;
            const durationMs = periodDays * 24 * 60 * 60 * 1000;

            const existingExpiry = txUser.subscription?.currentPeriodEnd
              ? new Date(txUser.subscription.currentPeriodEnd).getTime()
              : null;

            // Stacking / Early Renewal Formula: extend from existing expiry if active on same tier
            let baseTime = paymentTime;
            if (
              txUser.subscription?.status === 'active' &&
              txUser.subscription?.plan === txPayment.planId &&
              existingExpiry &&
              existingExpiry > paymentTime
            ) {
              baseTime = existingExpiry;
            }

            const newExpiry = new Date(baseTime + durationMs);
            const startDate =
              baseTime === existingExpiry && txUser.subscription?.currentPeriodStart
                ? txUser.subscription.currentPeriodStart
                : new Date(paymentTime);

            // Tier ranking to protect active higher-tier plans from being prematurely overwritten
            const TIER_RANKS = { free: 0, pro: 1, institution: 2, enterprise: 3 };
            const currentRank = TIER_RANKS[txUser.subscription?.plan] || 0;
            const newRank = TIER_RANKS[txPayment.planId] || 0;
            const isDowngrade =
              txUser.subscription?.status === 'active' &&
              existingExpiry &&
              existingExpiry > paymentTime &&
              currentRank > newRank;

            const effectivePlan = isDowngrade ? txUser.subscription.plan : txPayment.planId;
            const effectiveExpiry = isDowngrade ? new Date(existingExpiry) : newExpiry;

            // E. Update User subscription inside transaction
            const updatedUser = await User.findByIdAndUpdate(
              txUser._id,
              {
                $set: {
                  'subscription.plan': effectivePlan,
                  'subscription.status': 'active',
                  'subscription.billingCycle': txPayment.billingCycle,
                  'subscription.currentPeriodStart': startDate,
                  'subscription.currentPeriodEnd': effectiveExpiry,
                  'subscription.razorpayPaymentId': razorpayPaymentId || txPayment.razorpayPaymentId,
                  'subscription.razorpayOrderId': txPayment.razorpayOrderId,
                  'subscription.cancelAtPeriodEnd': false,
                  'subscription.canceledAt': null,
                },
                $addToSet: {
                  'subscription.appliedOrderIds': txPayment.razorpayOrderId,
                },
              },
              { session, new: true }
            );

            // F. Finalize Payment status & entitlementApplied inside same transaction
            const updatedPayment = await Payment.findByIdAndUpdate(
              txPayment._id,
              {
                $set: {
                  status: 'captured',
                  entitlementApplied: true,
                  razorpayPaymentId: razorpayPaymentId || txPayment.razorpayPaymentId,
                  razorpaySignature: razorpaySignature || txPayment.razorpaySignature,
                  method: paymentMethod || txPayment.method,
                  verifiedAt: txPayment.verifiedAt || new Date(paymentTime),
                },
              },
              { session, new: true }
            );

            result = { success: true, alreadyApplied: false, user: updatedUser, payment: updatedPayment };
          },
          {
            readPreference: 'primary',
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
          }
        );

        // Transaction successfully resolved
        break;
      } catch (txErr) {
        // Driver semantics: withTransaction handles internal TransientTransactionError and
        // UnknownTransactionCommitResult retries. This outer catch loop serves as a resilient backoff
        // wrapper for transient network/socket drops across multiple connection attempts.
        // Idempotency guarantee: If a previous commit succeeded before an UnknownTransactionCommitResult,
        // the subsequent attempt reads txPayment.entitlementApplied === true (Step A) or
        // txUser.subscription.appliedOrderIds (Step C) and exits safely without double-extending.
        const isTransient =
          txErr.hasErrorLabel?.('TransientTransactionError') ||
          txErr.message?.includes('WriteConflict') ||
          txErr.code === 112;

        const isUnknownCommit = txErr.hasErrorLabel?.('UnknownTransactionCommitResult');

        if ((isTransient || isUnknownCommit) && attempt < MAX_TX_RETRIES) {
          const jitter = Math.floor(Math.random() * 50);
          const delay = attempt * 100 + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Non-transient error or retries exhausted: throw so controller returns HTTP 500 for webhook redelivery
        throw txErr;
      }
    }

    if (!result) {
      throw new Error(`Transaction failed to resolve after ${attempt} attempts`);
    }

    return result;
  } finally {
    await session.endSession();
  }
}

/* ═══════════════════════════════════════════
   POST /api/billing/verify-payment
   — Secure payment signature & attribute verification.
   — Ignores client-supplied planId/billingCycle.
   — Verifies status is captured, amount matches, currency matches.
═══════════════════════════════════════════ */
async function verifyPayment(req, res) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
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

    // 2. Find Payment record and verify ownership
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

    // 3. Fetch payment from Razorpay API and strictly validate captured status, amount, and currency
    let rzpPayment = null;
    try {
      rzpPayment = await razorpayService.fetchPayment(razorpay_payment_id);
    } catch (fetchErr) {
      console.error('[Billing] fetchPayment error:', fetchErr.message);
      return res.status(502).json({ error: 'Failed to verify payment status with payment gateway.' });
    }

    if (!rzpPayment || rzpPayment.status !== 'captured') {
      secLogger.logSuspiciousActivity(req, 'Uncaptured payment verification attempt', {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        status: rzpPayment?.status,
      });
      return res.status(400).json({
        error: `Payment is not captured. Current gateway status: ${rzpPayment?.status || 'unknown'}`,
      });
    }

    // Validate captured amount against stored payment amount
    if (Number(rzpPayment.amount) !== Number(payment.amount)) {
      secLogger.logSuspiciousActivity(req, 'Payment amount mismatch in verifyPayment', {
        expected: payment.amount,
        actual: rzpPayment.amount,
      });
      return res.status(400).json({ error: 'Payment validation failed: amount mismatch' });
    }

    // Validate currency
    const rzpCurrency = (rzpPayment.currency || 'INR').toUpperCase();
    const storedCurrency = (payment.currency || 'INR').toUpperCase();
    if (rzpCurrency !== storedCurrency) {
      secLogger.logSuspiciousActivity(req, 'Payment currency mismatch in verifyPayment', {
        expected: storedCurrency,
        actual: rzpCurrency,
      });
      return res.status(400).json({ error: 'Payment validation failed: currency mismatch' });
    }

    // Validate order association
    if (rzpPayment.order_id && rzpPayment.order_id !== razorpay_order_id) {
      secLogger.logSuspiciousActivity(req, 'Payment order_id mismatch in verifyPayment', {
        expected: razorpay_order_id,
        actual: rzpPayment.order_id,
      });
      return res.status(400).json({ error: 'Payment validation failed: order ID mismatch' });
    }

    // 4. Apply entitlement idempotently using trusted server-side record
    const result = await applyPaymentEntitlement({
      payment,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paymentMethod: rzpPayment.method,
    });

    const activeUser = result.user;
    const currentPeriodEnd = activeUser.subscription?.currentPeriodEnd;

    secLogger.log({
      level: 'INFO',
      category: 'SYSTEM',
      message: `User ${activeUser.username} successfully verified pass for ${payment.planId} (${payment.billingCycle})`,
      actorId: req.user.id,
      ip: req.ip,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully activated ${payment.planId.toUpperCase()} prepaid pass!`,
      plan: payment.planId,
      billingCycle: payment.billingCycle,
      currentPeriodEnd,
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
   — Returns HTTP 500 on database failure to trigger retry.
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
        if (!paymentEntity) {
          secLogger.logSuspiciousActivity(req, 'Missing payment entity in payment.captured webhook');
          return res.status(400).json({ error: 'Missing payment entity' });
        }

        const orderId = paymentEntity.order_id;
        const paymentId = paymentEntity.id;
        const method = paymentEntity.method;

        // 1 & 2: Identify stored Payment using Razorpay order ID
        if (!orderId || !paymentId) {
          secLogger.logSuspiciousActivity(req, 'Missing order_id or payment ID in payment.captured webhook', {
            orderId,
            paymentId,
          });
          return res.status(400).json({ error: 'Missing order_id or payment ID' });
        }

        const paymentRecord = await Payment.findOne({ razorpayOrderId: orderId });
        if (!paymentRecord) {
          secLogger.logSuspiciousActivity(req, 'payment.captured received for unknown order', {
            orderId,
            paymentId,
          });
          return res.status(404).json({ error: 'Associated payment order record not found' });
        }

        // 3. Validate payment entity order_id against stored record
        if (paymentEntity.order_id !== paymentRecord.razorpayOrderId) {
          secLogger.logSuspiciousActivity(req, 'payment.captured order_id mismatch', {
            expected: paymentRecord.razorpayOrderId,
            actual: paymentEntity.order_id,
          });
          return res.status(400).json({ error: 'Order ID mismatch' });
        }

        // 4. Validate paymentEntity.amount === paymentRecord.amount
        if (Number(paymentEntity.amount) !== Number(paymentRecord.amount)) {
          secLogger.logSuspiciousActivity(req, 'payment.captured amount mismatch', {
            expected: paymentRecord.amount,
            actual: paymentEntity.amount,
            orderId,
            paymentId,
          });
          return res.status(400).json({ error: 'Payment amount mismatch' });
        }

        // 5. Validate paymentEntity.currency === paymentRecord.currency
        const entityCurrency = (paymentEntity.currency || 'INR').toUpperCase();
        const expectedCurrency = (paymentRecord.currency || 'INR').toUpperCase();
        if (entityCurrency !== expectedCurrency) {
          secLogger.logSuspiciousActivity(req, 'payment.captured currency mismatch', {
            expected: expectedCurrency,
            actual: entityCurrency,
            orderId,
            paymentId,
          });
          return res.status(400).json({ error: 'Payment currency mismatch' });
        }

        // 6. Validate gateway payment status is captured
        if (paymentEntity.status !== 'captured') {
          secLogger.logSuspiciousActivity(req, 'payment.captured received uncaptured status', {
            status: paymentEntity.status,
            orderId,
            paymentId,
          });
          return res.status(400).json({ error: 'Payment status is not captured' });
        }

        // 7. Validate payment ID matches if already recorded
        if (paymentRecord.razorpayPaymentId && paymentRecord.razorpayPaymentId !== paymentId) {
          secLogger.logSuspiciousActivity(req, 'payment.captured payment ID mismatch with existing record', {
            expected: paymentRecord.razorpayPaymentId,
            actual: paymentId,
            orderId,
          });
          return res.status(400).json({ error: 'Payment ID mismatch with existing record' });
        }

        // 8. Invoke canonical transaction-based entitlement function
        await applyPaymentEntitlement({
          payment: paymentRecord,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          paymentMethod: method,
        });
        console.log(`[Billing Webhook] Entitlement applied for order ${orderId} via payment.captured`);
        break;
      }

      /* ── Order Paid ── */
      case 'order.paid': {
        const orderEntity = event.payload?.order?.entity;
        if (orderEntity?.id) {
          const paymentRecord = await Payment.findOne({ razorpayOrderId: orderEntity.id });
          if (paymentRecord && paymentRecord.entitlementApplied && paymentRecord.status === 'captured') {
            console.log(`[Billing Webhook] Order ${orderEntity.id} already finalized; no-op on order.paid`);
            break;
          }
          // Do not grant entitlement on order.paid without individual captured payment validation
          console.log(`[Billing Webhook] Order ${orderEntity.id} marked paid. Activation handled via payment.captured.`);
        }
        break;
      }

      /* ── Payment Failed ── */
      case 'payment.failed': {
        const paymentEntity = event.payload?.payment?.entity;
        if (paymentEntity?.order_id) {
          // A delayed failed-attempt event must not overwrite an order already marked captured
          await Payment.findOneAndUpdate(
            {
              razorpayOrderId: paymentEntity.order_id,
              status: { $ne: 'captured' },
              entitlementApplied: { $ne: true },
            },
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

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[Billing Webhook] Error processing ${eventType}:`, err.message);
    // Return HTTP 500 so Razorpay retries the webhook delivery
    return res.status(500).json({ error: 'Internal processing error' });
  }
}

/* ═══════════════════════════════════════════
   GET /api/billing/subscription
   — Returns current user's plan and real-time expiry state.
═══════════════════════════════════════════ */
async function getSubscription(req, res) {
  try {
    const user = await User.findById(req.user.id).select('subscription freeUsage');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const rawPlan = user.subscription?.plan || 'free';
    const rawStatus = user.subscription?.status || 'none';
    const periodEnd = user.subscription?.currentPeriodEnd
      ? new Date(user.subscription.currentPeriodEnd)
      : null;

    // Real-time expiry evaluation: pass is valid only if periodEnd > now
    const isExpired = periodEnd !== null && periodEnd <= now;
    const isPaid = !isExpired && ['pro', 'institution', 'enterprise'].includes(rawPlan) && rawStatus === 'active';
    const effectivePlan = isPaid ? rawPlan : 'free';
    const effectiveStatus = isExpired ? 'expired' : rawStatus;

    // Free tier usage (resets monthly)
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const debatesUsed =
      user.freeUsage?.resetMonth === currentMonth
        ? user.freeUsage.debatesThisMonth || 0
        : 0;
    const debatesLimit = isPaid ? null : FREE_DEBATE_LIMIT;

    return res.status(200).json({
      plan: effectivePlan,
      status: effectiveStatus,
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
   — Prepaid pass cancellation status notice.
   — Explains that prepaid access remains active until currentPeriodEnd.
═══════════════════════════════════════════ */
async function cancelSubscription(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.subscription?.plan || user.subscription.plan === 'free') {
      return res.status(400).json({ error: 'No active paid pass to cancel.' });
    }

    await User.findByIdAndUpdate(user._id, {
      'subscription.cancelAtPeriodEnd': true,
      'subscription.canceledAt': new Date(),
    });

    return res.status(200).json({
      message: 'Prepaid access remains active until your pass expiration date. Because DebateForge uses prepaid passes without automatic renewal, no recurring charges will occur.',
      currentPeriodEnd: user.subscription.currentPeriodEnd,
    });
  } catch (err) {
    console.error('[Billing] cancelSubscription error:', err.message);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/billing/reactivate
   — Prepaid pass reactivation notice.
═══════════════════════════════════════════ */
async function reactivateSubscription(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.subscription?.cancelAtPeriodEnd) {
      return res.status(400).json({ error: 'Pass is already active.' });
    }

    await User.findByIdAndUpdate(user._id, {
      'subscription.cancelAtPeriodEnd': false,
      'subscription.canceledAt': null,
    });

    return res.status(200).json({
      message: 'Prepaid access pass is active until your expiration date. To extend access, you can purchase an early renewal pass at any time.',
      currentPeriodEnd: user.subscription.currentPeriodEnd,
    });
  } catch (err) {
    console.error('[Billing] reactivateSubscription error:', err.message);
    return res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
}

/* ═══════════════════════════════════════════
   FREE TIER GATE MIDDLEWARE
   — Real-time expiry check and quota enforcement.
   — 5 debates/month limit for free users.
═══════════════════════════════════════════ */
async function checkDebateQuota(req, res, next) {
  try {
    if (process.env.NODE_ENV === 'test' && !req._enforceQuotaInTest) return next();
    if (!req.user) return next();

    const user = await User.findById(req.user.id).select('subscription freeUsage');
    if (!user) return next();

    const now = new Date();
    const plan = user.subscription?.plan || 'free';
    const status = user.subscription?.status || 'none';
    const periodEnd = user.subscription?.currentPeriodEnd
      ? new Date(user.subscription.currentPeriodEnd)
      : null;

    // A paid entitlement is valid ONLY if status is active and periodEnd > now
    const isPaidValid =
      ['pro', 'institution', 'enterprise'].includes(plan) &&
      status === 'active' &&
      periodEnd !== null &&
      periodEnd > now;

    if (isPaidValid) {
      return next();
    }

    // If the pass has expired, lazily downgrade user in database
    if (status === 'active' && periodEnd && periodEnd <= now) {
      await User.findByIdAndUpdate(user._id, {
        'subscription.status': 'expired',
        'subscription.plan': 'free',
      });
    }

    // Apply Free-tier calendar month quota logic (5 debates/month)
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
  applyPaymentEntitlement,
};
