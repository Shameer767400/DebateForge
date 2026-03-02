const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  return obj;
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;

