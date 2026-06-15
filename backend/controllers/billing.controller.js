/**
 * @fileoverview billing.controller.js — DebateForge Stripe Billing
 *
 * Handles:
 *   POST /api/billing/create-checkout-session  — Start Stripe Checkout
 *   POST /api/billing/create-portal-session    — Open Stripe Customer Portal
 *   GET  /api/billing/subscription             — Get current plan status
 *   POST /api/billing/cancel                   — Schedule cancellation at period end
 *   POST /api/billing/webhook                  — Stripe webhook (raw body required)
 *
 * Stripe Price IDs must be set in environment variables:
 *   STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY,
 *   STRIPE_PRICE_INSTITUTION_MONTHLY, STRIPE_PRICE_INSTITUTION_YEARLY
 *
 * @module controllers/billing.controller
 */

const { User } = require('../models');

// Lazy Stripe client — only created when first needed.
// This prevents a crash when STRIPE_SECRET_KEY is not set (e.g. in Jest tests).
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set. Add it to your environment variables.');
    }
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */

const FREE_DEBATE_LIMIT = parseInt(process.env.FREE_DEBATE_LIMIT, 10) || 5;

// Map plan ID → Stripe Price ID (from env)
const PRICE_IDS = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    yearly:  process.env.STRIPE_PRICE_PRO_YEARLY,
  },
  institution: {
    monthly: process.env.STRIPE_PRICE_INSTITUTION_MONTHLY,
    yearly:  process.env.STRIPE_PRICE_INSTITUTION_YEARLY,
  },
};

// Which plan each Stripe price ID maps back to (reverse lookup for webhooks)
function getPlanFromPriceId(priceId) {
  for (const [plan, cycles] of Object.entries(PRICE_IDS)) {
    for (const [cycle, id] of Object.entries(cycles)) {
      if (id === priceId) return { plan, billingCycle: cycle };
    }
  }
  return { plan: 'free', billingCycle: 'monthly' };
}

/* ═══════════════════════════════════════════
   HELPER: Get or create Stripe customer
═══════════════════════════════════════════ */
async function getOrCreateStripeCustomer(user) {
  if (user.subscription?.stripeCustomerId) {
    return user.subscription.stripeCustomerId;
  }

  const customer = await getStripe().customers.create({
    email: user.email,
    name:  user.username,
    metadata: {
      userId:   user._id.toString(),
      username: user.username,
    },
  });

  await User.findByIdAndUpdate(user._id, {
    'subscription.stripeCustomerId': customer.id,
  });

  return customer.id;
}

/* ═══════════════════════════════════════════
   POST /api/billing/create-checkout-session
   — Creates a Stripe Checkout session and
     returns the hosted checkout URL.
═══════════════════════════════════════════ */
async function createCheckoutSession(req, res) {
  try {
    const { planId, billingCycle = 'monthly' } = req.body;

    // Validate plan
    if (!PRICE_IDS[planId]) {
      return res.status(400).json({ error: `Invalid plan: ${planId}` });
    }

    const priceId = PRICE_IDS[planId][billingCycle];
    if (!priceId) {
      return res.status(500).json({
        error: `Stripe price ID not configured for ${planId}/${billingCycle}. Set STRIPE_PRICE_${planId.toUpperCase()}_${billingCycle.toUpperCase()} in env.`,
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // If already on this plan, redirect to portal instead
    if (user.subscription?.plan === planId && user.subscription?.status === 'active') {
      return res.status(400).json({
        error: 'Already subscribed to this plan.',
        alreadySubscribed: true,
      });
    }

    const customerId = await getOrCreateStripeCustomer(user);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],

      // Institution plan: offer 14-day free trial
      ...(planId === 'institution' && {
        subscription_data: {
          trial_period_days: 14,
          metadata: { planId, billingCycle, userId: user._id.toString() },
        },
      }),

      // Redirect URLs
      success_url: `${frontendUrl}/dashboard?upgraded=true&plan=${planId}`,
      cancel_url:  `${frontendUrl}/pricing?canceled=true`,

      // Pre-fill email
      customer_email: user.subscription?.stripeCustomerId ? undefined : user.email,

      // Metadata for webhook correlation
      metadata: { userId: user._id.toString(), planId, billingCycle },

      // Allow promotion codes
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Billing] createCheckoutSession error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/billing/create-portal-session
   — Opens the Stripe Customer Portal so users
     can manage payment methods, download
     invoices, and cancel subscriptions.
═══════════════════════════════════════════ */
async function createPortalSession(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.subscription?.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found. Subscribe first.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const portalSession = await getStripe().billingPortal.sessions.create({
      customer:   user.subscription.stripeCustomerId,
      return_url: `${frontendUrl}/dashboard`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('[Billing] createPortalSession error:', err.message);
    return res.status(500).json({ error: 'Failed to open billing portal' });
  }
}

/* ═══════════════════════════════════════════
   GET /api/billing/subscription
   — Returns the current user's plan, usage,
     and billing details.
═══════════════════════════════════════════ */
async function getSubscription(req, res) {
  try {
    const user = await User.findById(req.user.id).select(
      'subscription freeUsage'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const plan        = user.subscription?.plan || 'free';
    const status      = user.subscription?.status || 'none';
    const isPaid      = ['pro', 'institution', 'enterprise'].includes(plan)
                        && ['active', 'trialing'].includes(status);

    // Free tier usage (reset monthly)
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const debatesUsed  = (user.freeUsage?.resetMonth === currentMonth)
                         ? (user.freeUsage.debatesThisMonth || 0)
                         : 0;
    const debatesLimit = isPaid ? null : FREE_DEBATE_LIMIT; // null = unlimited

    return res.status(200).json({
      plan,
      status,
      isPaid,
      billingCycle:      user.subscription?.billingCycle || 'monthly',
      currentPeriodEnd:  user.subscription?.currentPeriodEnd || null,
      cancelAtPeriodEnd: user.subscription?.cancelAtPeriodEnd || false,
      trialEndsAt:       user.subscription?.trialEndsAt || null,

      // Usage
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
   — Schedules subscription to cancel at the
     end of the current billing period.
     (Does NOT cancel immediately — user keeps
      access until period end.)
═══════════════════════════════════════════ */
async function cancelSubscription(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.subscription?.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription to cancel.' });
    }

    // Schedule cancellation at period end (not immediate)
    await getStripe().subscriptions.update(user.subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await User.findByIdAndUpdate(user._id, {
      'subscription.cancelAtPeriodEnd': true,
    });

    return res.status(200).json({
      message: 'Subscription will be canceled at the end of the billing period.',
      currentPeriodEnd: user.subscription.currentPeriodEnd,
    });
  } catch (err) {
    console.error('[Billing] cancelSubscription error:', err.message);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/billing/reactivate
   — Reactivates a subscription that was
     scheduled for cancellation.
═══════════════════════════════════════════ */
async function reactivateSubscription(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.subscription?.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No subscription to reactivate.' });
    }

    if (!user.subscription.cancelAtPeriodEnd) {
      return res.status(400).json({ error: 'Subscription is not scheduled for cancellation.' });
    }

    await getStripe().subscriptions.update(user.subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await User.findByIdAndUpdate(user._id, {
      'subscription.cancelAtPeriodEnd': false,
    });

    return res.status(200).json({ message: 'Subscription reactivated successfully.' });
  } catch (err) {
    console.error('[Billing] reactivateSubscription error:', err.message);
    return res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
}

/* ═══════════════════════════════════════════
   POST /api/billing/webhook
   — Stripe sends signed events here.
   — CRITICAL: Uses raw body (not JSON-parsed)
     for signature verification.
   — Mount BEFORE express.json() middleware!
═══════════════════════════════════════════ */
async function handleWebhook(req, res) {
  const sig           = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Billing] STRIPE_WEBHOOK_SECRET not set — cannot verify webhook');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Billing] Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log(`[Billing] Webhook received: ${event.type}`);

  try {
    switch (event.type) {

      /* ── Checkout completed → activate subscription ── */
      case 'checkout.session.completed': {
        const session    = event.data.object;
        const userId     = session.metadata?.userId;
        const planId     = session.metadata?.planId || 'pro';
        const billingCycle = session.metadata?.billingCycle || 'monthly';

        if (!userId) break;

        const sub = session.subscription
          ? await getStripe().subscriptions.retrieve(session.subscription)
          : null;

        await User.findByIdAndUpdate(userId, {
          'subscription.plan':                 planId,
          'subscription.stripeCustomerId':     session.customer,
          'subscription.stripeSubscriptionId': session.subscription || null,
          'subscription.stripePriceId':        sub?.items?.data[0]?.price?.id || null,
          'subscription.billingCycle':         billingCycle,
          'subscription.status':               sub?.status || 'active',
          'subscription.currentPeriodStart':   sub ? new Date(sub.current_period_start * 1000) : null,
          'subscription.currentPeriodEnd':     sub ? new Date(sub.current_period_end   * 1000) : null,
          'subscription.trialEndsAt':          sub?.trial_end ? new Date(sub.trial_end * 1000) : null,
          'subscription.cancelAtPeriodEnd':    false,
        });

        console.log(`[Billing] User ${userId} upgraded to ${planId} (${billingCycle})`);
        break;
      }

      /* ── Subscription updated (plan change, renewal, cancel toggle) ── */
      case 'customer.subscription.updated': {
        const sub  = event.data.object;
        const user = await User.findOne({ 'subscription.stripeSubscriptionId': sub.id });
        if (!user) break;

        const priceId          = sub.items.data[0]?.price?.id;
        const { plan, billingCycle } = getPlanFromPriceId(priceId);

        await User.findByIdAndUpdate(user._id, {
          'subscription.plan':              plan,
          'subscription.stripePriceId':     priceId,
          'subscription.billingCycle':      billingCycle,
          'subscription.status':            sub.status,
          'subscription.currentPeriodStart': new Date(sub.current_period_start * 1000),
          'subscription.currentPeriodEnd':   new Date(sub.current_period_end   * 1000),
          'subscription.trialEndsAt':        sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          'subscription.cancelAtPeriodEnd':  sub.cancel_at_period_end,
        });

        console.log(`[Billing] Subscription updated for user ${user._id}: ${plan} / ${sub.status}`);
        break;
      }

      /* ── Subscription deleted (hard cancel or non-payment) ── */
      case 'customer.subscription.deleted': {
        const sub  = event.data.object;
        const user = await User.findOne({ 'subscription.stripeSubscriptionId': sub.id });
        if (!user) break;

        await User.findByIdAndUpdate(user._id, {
          'subscription.plan':                 'free',
          'subscription.stripeSubscriptionId': null,
          'subscription.stripePriceId':        null,
          'subscription.status':               'canceled',
          'subscription.cancelAtPeriodEnd':    false,
          'subscription.canceledAt':           new Date(),
          'subscription.currentPeriodEnd':     null,
        });

        console.log(`[Billing] Subscription canceled for user ${user._id} — reverted to free`);
        break;
      }

      /* ── Invoice paid → renew period ── */
      case 'invoice.paid': {
        const invoice = event.data.object;
        const sub = invoice.subscription
          ? await getStripe().subscriptions.retrieve(invoice.subscription)
          : null;
        if (!sub) break;

        const user = await User.findOne({ 'subscription.stripeSubscriptionId': sub.id });
        if (!user) break;

        await User.findByIdAndUpdate(user._id, {
          'subscription.status':             'active',
          'subscription.currentPeriodStart': new Date(sub.current_period_start * 1000),
          'subscription.currentPeriodEnd':   new Date(sub.current_period_end   * 1000),
        });

        console.log(`[Billing] Invoice paid for user ${user._id}`);
        break;
      }

      /* ── Payment failed → mark past_due ── */
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const user = await User.findOne({
          'subscription.stripeCustomerId': invoice.customer,
        });
        if (!user) break;

        await User.findByIdAndUpdate(user._id, {
          'subscription.status': 'past_due',
        });

        console.warn(`[Billing] Payment failed for user ${user._id}`);
        break;
      }

      /* ── Trial ending soon (3 days before) ── */
      case 'customer.subscription.trial_will_end': {
        const sub  = event.data.object;
        const user = await User.findOne({ 'subscription.stripeSubscriptionId': sub.id });
        if (user) {
          // TODO: send "Your trial ends in 3 days" email via email.service
          console.log(`[Billing] Trial ending soon for user ${user._id}`);
        }
        break;
      }

      default:
        // Unhandled event types — log and ignore
        console.log(`[Billing] Unhandled webhook event: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Billing] Error processing webhook ${event.type}:`, err.message);
    // Return 200 to prevent Stripe from retrying for processing errors
    // (signature was valid; the error is on our side)
  }

  // Always acknowledge receipt to Stripe
  return res.status(200).json({ received: true });
}

/* ═══════════════════════════════════════════
   FREE TIER GATE MIDDLEWARE
   — Use on debate creation routes to enforce
     5 debates/month limit for free users.
   — Import and apply: app.use('/api/debates/start', checkDebateQuota);
═══════════════════════════════════════════ */
async function checkDebateQuota(req, res, next) {
  try {
    // Skip quota check in test environment
    if (process.env.NODE_ENV === 'test') return next();
    if (!req.user) return next(); // auth middleware will handle unauthenticated

    const user = await User.findById(req.user.id).select('subscription freeUsage');
    if (!user) return next();

    const plan   = user.subscription?.plan || 'free';
    const status = user.subscription?.status || 'none';
    const isPaid = ['pro', 'institution', 'enterprise'].includes(plan)
                   && ['active', 'trialing'].includes(status);

    // Paid users: unlimited
    if (isPaid) return next();

    // Free users: check monthly quota atomically
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const isNewMonth = user.freeUsage?.resetMonth !== currentMonth;

    let updatedUser;
    if (isNewMonth) {
      // Rollover to new month atomically.
      updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          $or: [
            { 'freeUsage.resetMonth': { $ne: currentMonth } },
            { 'freeUsage.resetMonth': { $exists: false } }
          ]
        },
        {
          $set: {
            'freeUsage.debatesThisMonth': 1,
            'freeUsage.resetMonth': currentMonth
          }
        },
        { new: true }
      );

      // If another request beat us to the month transition, refetch and run increment logic
      if (!updatedUser) {
        const refetched = await User.findById(user._id).select('freeUsage');
        const debatesUsed = refetched?.freeUsage?.debatesThisMonth || 0;
        if (debatesUsed >= FREE_DEBATE_LIMIT) {
          return res.status(402).json({
            error: `Free plan limit reached. You've used ${debatesUsed}/${FREE_DEBATE_LIMIT} debates this month.`,
            code:  'FREE_LIMIT_REACHED',
            upgradeUrl: '/pricing',
            limit: FREE_DEBATE_LIMIT,
            used:  debatesUsed,
          });
        }
        updatedUser = await User.findOneAndUpdate(
          {
            _id: user._id,
            'freeUsage.resetMonth': currentMonth,
            'freeUsage.debatesThisMonth': { $lt: FREE_DEBATE_LIMIT }
          },
          {
            $inc: { 'freeUsage.debatesThisMonth': 1 }
          },
          { new: true }
        );
      }
    } else {
      // Same month: increment counter atomically if strictly below FREE_DEBATE_LIMIT
      updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          'freeUsage.resetMonth': currentMonth,
          'freeUsage.debatesThisMonth': { $lt: FREE_DEBATE_LIMIT }
        },
        {
          $inc: { 'freeUsage.debatesThisMonth': 1 }
        },
        { new: true }
      );
    }

    if (!updatedUser) {
      // Refetch current state to display exact usage count
      const refetched = await User.findById(user._id).select('freeUsage');
      const debatesUsed = refetched?.freeUsage?.debatesThisMonth || 0;
      return res.status(402).json({
        error: `Free plan limit reached. You've used ${debatesUsed}/${FREE_DEBATE_LIMIT} debates this month.`,
        code:  'FREE_LIMIT_REACHED',
        upgradeUrl: '/pricing',
        limit: FREE_DEBATE_LIMIT,
        used:  debatesUsed,
      });
    }

    const currentUsed = updatedUser.freeUsage?.debatesThisMonth || 0;

    // Attach usage info to request for downstream use
    req.debateUsage = {
      used:      currentUsed,
      limit:     FREE_DEBATE_LIMIT,
      remaining: Math.max(0, FREE_DEBATE_LIMIT - currentUsed),
    };

    return next();
  } catch (err) {
    console.error('[Billing] checkDebateQuota error:', err.message);
    return next(); // Fail open — don't block debates on billing errors
  }
}

module.exports = {
  createCheckoutSession,
  createPortalSession,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  handleWebhook,
  checkDebateQuota,
};
