const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'viewer', 'user'],
      default: 'user',
    },
    /* ── Email verification with OTP ── */
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationOTP: {
      type: String,
      default: null,
    },
    emailVerificationOTPExpires: {
      type: Date,
      default: null,
    },
    /* ── Password reset ── */
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    /* ── Account lockout ── */
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    eloRating: {
      type: Number,
      default: 1000,
      min: 0,
    },
    totalDebates: {
      type: Number,
      default: 0,
    },
    wins: {
      type: Number,
      default: 0,
    },
    losses: {
      type: Number,
      default: 0,
    },
    draws: {
      type: Number,
      default: 0,
    },
    fallacyProfile: {
      type: Map,
      of: Number,
      default: {},
    },
    // Stores: { "slippery_slope": 5, "strawman": 3, "ad_hominem": 1 }
    // Updated with $inc after each debate
    achievements: {
      type: [String],
      default: [],
    },
    // Values: 'first_debate', 'no_fallacy_streak_3', 'logic_master',
    //         'evidence_king', '10_wins', 'comeback_king'
    profilePicUrl: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      default: '',
      maxlength: 200,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    streak: {
      current: { type: Number, default: 0 },
      longest: { type: Number, default: 0 },
      lastDebateDate: { type: Date, default: null },
      freezeUsed: { type: Boolean, default: false },
    },
    pushSubscription: {
      type: Schema.Types.Mixed,
      default: null,
    },
    targetImprovements: {
      type: [String],
      default: [],
    },
    grammarMistakes: {
      type: [String],
      default: [],
    },

    /* ── Cumulative per-dimension score tracking ── */
    totalLogicScore:    { type: Number, default: 0 },
    totalEvidenceScore: { type: Number, default: 0 },
    totalClarityScore:  { type: Number, default: 0 },
    totalScoredTurns:   { type: Number, default: 0 },

    /* ── Adaptive Coaching State ── */
    coachingState: {
      weaknessHistory: [{
        fallacyType:      { type: String },
        totalOccurrences: { type: Number, default: 0 },
        cleanStreak:      { type: Number, default: 0 },
        improved:         { type: Boolean, default: false },
        lastSeen:         { type: Date, default: null },
      }],
      weakPhase:          { type: String, default: null },
      coachingLevel:      { type: Number, default: 0 },
      activeDrillFallacy: { type: String, default: null },
    },

    /* ═══════════════════════════════════════════
       SUBSCRIPTION / BILLING
       Managed by Stripe — never modify directly;
       always update via webhook or billing controller.
    ═══════════════════════════════════════════ */
    subscription: {
      // Plan tier: free | pro | institution | enterprise
      plan: {
        type: String,
        enum: ['free', 'pro', 'institution', 'enterprise'],
        default: 'free',
      },
      // Stripe IDs
      stripeCustomerId:     { type: String, default: null },
      stripeSubscriptionId: { type: String, default: null },
      stripePriceId:        { type: String, default: null },

      // Billing cycle: monthly | yearly
      billingCycle: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly',
      },

      // Subscription period (from Stripe)
      currentPeriodStart: { type: Date, default: null },
      currentPeriodEnd:   { type: Date, default: null },

      // Subscription status mirrors Stripe status
      status: {
        type: String,
        enum: ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'none'],
        default: 'none',
      },

      // Trial
      trialEndsAt: { type: Date, default: null },

      // Cancellation
      cancelAtPeriodEnd: { type: Boolean, default: false },
      canceledAt:        { type: Date, default: null },
    },

    /* ── Free tier usage tracking ── */
    freeUsage: {
      // Debates started this calendar month (resets on 1st of each month)
      debatesThisMonth: { type: Number, default: 0 },
      // Which month this counter is for (YYYY-MM string, e.g. '2026-06')
      resetMonth: { type: String, default: null },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.comparePassword = async function comparePassword(plainText) {
  return bcrypt.compare(plainText, this.passwordHash);
};

userSchema.methods.getWinRate = function getWinRate() {
  if (this.totalDebates === 0) return 0;
  return Math.round((this.wins / this.totalDebates) * 100);
};

/* ── Generate a hashed password reset token (returns the raw token for the email) ── */
userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return rawToken;
};

/* ── Generate 6-digit OTP for email verification ── */
/* Security: raw OTP returned for email; only SHA-256 hash stored in DB ── */
userSchema.methods.createEmailVerificationOTP = function createEmailVerificationOTP() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  this.emailVerificationOTP = crypto.createHash('sha256').update(otp).digest('hex'); // store hash only
  this.emailVerificationOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
  return otp; // raw OTP returned to be emailed — never stored in DB
};

/* ── Check if account is currently locked ── */
userSchema.methods.isLocked = function isLocked() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.emailVerificationOTP;
  delete obj.emailVerificationOTPExpires;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  return obj;
};

/* ═══════════════════════════════════════════
   INDEXES — performance-critical queries
═══════════════════════════════════════════ */

// Leaderboard: sort users by ELO descending
userSchema.index({ eloRating: -1 });

// Active users query (admin / analytics)
userSchema.index({ lastActive: -1 });

// TTL index: auto-expire lockout (MongoDB handles cleanup)
userSchema.index({ lockUntil: 1 }, { expireAfterSeconds: 0, sparse: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;

