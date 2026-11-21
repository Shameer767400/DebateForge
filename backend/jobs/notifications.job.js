'use strict';

const cron = require('node-cron');
const { User, Payment } = require('../models');
const { sendPushNotification } = require('../services/push.service');
const { resetWeeklyFreeze } = require('../services/streak.service');
const razorpayService = require('../services/razorpay.service');

/**
 * Schedule all notification-related cron jobs.
 */
function scheduleNotificationJobs() {
  /* ── Daily at 6 PM: remind users at risk of losing their streak ── */
  cron.schedule('0 18 * * *', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Find users who haven't debated today but have an active streak
      const usersAtRisk = await User.find({
        'streak.current': { $gte: 1 },
        'streak.lastDebateDate': { $lt: today, $gte: yesterday },
        pushSubscription: { $ne: null },
      }).limit(500);

      for (const user of usersAtRisk) {
        if (!user.pushSubscription?.endpoint) continue;

        try {
          await sendPushNotification(user.pushSubscription, {
            title: `🔥 ${user.streak.current}-day streak at risk!`,
            body: 'Debate now to keep your streak alive. You still have time!',
            icon: '/logo192.png',
            data: { url: '/lobby' },
          });
        } catch (err) {
          if (err.message === 'SUBSCRIPTION_EXPIRED') {
            user.pushSubscription = null;
            await user.save();
          }
        }
      }

      // eslint-disable-next-line no-console
      console.log(`[CRON] Streak reminder sent to ${usersAtRisk.length} users`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CRON] Streak reminder error:', err.message);
    }
  });

  /* ── Weekly Monday at midnight: reset streak freezes ── */
  cron.schedule('0 0 * * 1', async () => {
    try {
      const users = await User.find({ 'streak.freezeUsed': true });

      for (const user of users) {
        resetWeeklyFreeze(user);
        await user.save();
      }

      // eslint-disable-next-line no-console
      console.log(`[CRON] Weekly freeze reset for ${users.length} users`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CRON] Freeze reset error:', err.message);
    }
  });

  /* ── Daily at Midnight: expire prepaid passes whose currentPeriodEnd has passed ── */
  cron.schedule('0 0 * * *', async () => {
    await expireStalePrepaidPasses();
  });

  /* ── Daily at 2:30 AM: reconcile orphaned captured payments from Razorpay ── */
  cron.schedule('30 2 * * *', async () => {
    await reconcileOrphanedPayments();
  });

  /* ── Every 10 min: ping ML service to prevent Render cold starts ── */
  const ML_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || null;
  const axios = require('axios');

  cron.schedule('*/14 * * * *', async () => {
    try {
      const res = await axios.get(`${ML_URL}/health`, { timeout: 8000 });
      // eslint-disable-next-line no-console
      console.log(`[CRON] ML keepalive ✅ ${res.data?.status || 'ok'} (${ML_URL})`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[CRON] ML keepalive ⚠️  ${err.message} — service may be waking up`);
    }
    // Also ping backend itself to keep it warm
    if (BACKEND_URL) {
      try { await axios.get(`${BACKEND_URL}/health`, { timeout: 5000 }); } catch { /* noop */ }
    }
  });

  // eslint-disable-next-line no-console
  console.log(`[CRON] ML keepalive scheduled every 10 min → ${ML_URL}`);
  // eslint-disable-next-line no-console
  console.log('[CRON] Notification jobs scheduled ✅');
}

/**
 * Scan for active passes whose currentPeriodEnd has elapsed and downgrade them to free.
 * @returns {Promise<{ modifiedCount: number }>}
 */
async function expireStalePrepaidPasses() {
  try {
    const now = new Date();
    const result = await User.updateMany(
      {
        'subscription.status': 'active',
        'subscription.currentPeriodEnd': { $lt: now, $ne: null },
      },
      {
        $set: {
          'subscription.status': 'expired',
          'subscription.plan': 'free',
        },
      }
    );

    // eslint-disable-next-line no-console
    console.log(`[CRON] Daily pass expiry check: ${result.modifiedCount} expired passes downgraded to free.`);
    return { modifiedCount: result.modifiedCount || 0 };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[CRON] Daily pass expiry error:', err.message);
    throw err;
  }
}

/**
 * Reconciles pending Payment records against the Razorpay API.
 * Detects payments captured at Razorpay that were not finalized in DebateForge
 * (e.g., due to dropped webhooks or client drop-offs).
 * Uses the canonical multi-document ACID transaction function.
 *
 * @returns {Promise<{ reconciled: number, checked: number }>}
 */
async function reconcileOrphanedPayments() {
  if (!razorpayService.isConfigured()) {
    // eslint-disable-next-line no-console
    console.log('[Reconciliation] Skipping: Razorpay is not configured.');
    return { reconciled: 0, checked: 0 };
  }

  try {
    const { applyPaymentEntitlement } = require('../controllers/billing.controller');
    const now = Date.now();
    const thirtyMinsAgo = new Date(now - 30 * 60 * 1000);
    const twoDaysAgo = new Date(now - 48 * 60 * 60 * 1000);

    // Find pending orders between 30 minutes and 48 hours old
    const pendingPayments = await Payment.find({
      status: 'created',
      entitlementApplied: false,
      createdAt: { $lt: thirtyMinsAgo, $gte: twoDaysAgo },
    }).limit(50);

    let reconciledCount = 0;

    for (const payment of pendingPayments) {
      try {
        // Validate stored payment record integrity: reject if stored currency is missing, null, empty, or malformed
        if (
          !payment.currency ||
          typeof payment.currency !== 'string' ||
          payment.currency.trim().length === 0
        ) {
          // eslint-disable-next-line no-console
          console.warn(`[Reconciliation] Payment record ${payment._id} (${payment.razorpayOrderId}) has missing, empty, or malformed stored currency: '${payment.currency}'; rejected.`);
          continue;
        }

        const storedCurrency = payment.currency.trim().toUpperCase();

        // 1. Fetch order details from Razorpay API outside transaction
        const rzpOrder = await razorpayService.fetchOrder(payment.razorpayOrderId);
        if (!rzpOrder) {
          // eslint-disable-next-line no-console
          console.warn(`[Reconciliation] Order ${payment.razorpayOrderId} not found on Razorpay; leaving for next cycle.`);
          continue;
        }

        // Only orders that are paid or attempted can have captured payments
        if (rzpOrder.status !== 'paid' && rzpOrder.status !== 'attempted') {
          continue;
        }

        // 2. Fetch individual payment attempts from Razorpay API
        let orderPayments;
        try {
          orderPayments = await razorpayService.fetchOrderPayments(payment.razorpayOrderId);
        } catch (fetchErr) {
          // eslint-disable-next-line no-console
          console.warn(`[Reconciliation] Temporary error fetching payments for order ${payment.razorpayOrderId}: ${fetchErr.message}; leaving for next cycle.`);
          continue;
        }

        const items = orderPayments?.items || [];
        // Strict Validation: Require an exact match for captured status, payment ID, Razorpay order ID, amount, and currency.
        // Reject missing or mismatched fields.
        const matchingPayment = items.find((p) => {
          if (!p || typeof p !== 'object') return false;

          // Reject missing required fields
          if (!p.id || !p.status || !p.order_id || p.amount === undefined || p.amount === null || !p.currency) {
            return false;
          }

          // Exact match validations
          const isCaptured = p.status === 'captured';
          const isRealId = typeof p.id === 'string' && p.id.startsWith('pay_');
          const isOrderMatch = typeof p.order_id === 'string' && p.order_id === payment.razorpayOrderId;
          const isAmountMatch = typeof p.amount === 'number' && p.amount === payment.amount;
          const isCurrencyMatch = typeof p.currency === 'string' && p.currency.trim().toUpperCase() === storedCurrency;
          const isLocalIdMatch = !payment.razorpayPaymentId || payment.razorpayPaymentId === p.id;

          return isCaptured && isRealId && isOrderMatch && isAmountMatch && isCurrencyMatch && isLocalIdMatch;
        });

        if (matchingPayment) {
          // 3. Apply entitlement using the canonical ACID transaction function
          // No synthetic payment IDs or fake signatures
          await applyPaymentEntitlement({
            payment,
            razorpayPaymentId: matchingPayment.id,
            razorpaySignature: payment.razorpaySignature || null,
            paymentMethod: matchingPayment.method || 'reconciled_gateway',
          });

          reconciledCount++;
          // eslint-disable-next-line no-console
          console.log(`[Reconciliation] Successfully verified and applied pass for order ${payment.razorpayOrderId} via payment ${matchingPayment.id}`);
        } else {
          // If > 24h old and unpaid/attempted with no matching captured payment, mark failed
          if (rzpOrder.status === 'attempted' && (now - new Date(payment.createdAt).getTime()) > 24 * 60 * 60 * 1000) {
            await Payment.findByIdAndUpdate(payment._id, {
              status: 'failed',
              errorDescription: 'Payment expired or abandoned by user',
            });
            // eslint-disable-next-line no-console
            console.log(`[Reconciliation] Order ${payment.razorpayOrderId} abandoned/expired (>24h); marked failed.`);
          } else {
            // eslint-disable-next-line no-console
            console.log(`[Reconciliation] Order ${payment.razorpayOrderId} has no matching captured payment; skipped.`);
          }
        }
      } catch (itemErr) {
        // Temporary network or API error: log warning and skip without marking failed
        // eslint-disable-next-line no-console
        console.warn(`[Reconciliation] Transient error processing order ${payment.razorpayOrderId}:`, itemErr.message);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[Reconciliation] Completed check: ${reconciledCount}/${pendingPayments.length} payments reconciled.`);
    return { reconciled: reconciledCount, checked: pendingPayments.length };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Reconciliation] Error in reconcileOrphanedPayments:', err.message);
    return { reconciled: 0, checked: 0, error: err.message };
  }
}

module.exports = {
  scheduleNotificationJobs,
  expireStalePrepaidPasses,
  reconcileOrphanedPayments,
};
