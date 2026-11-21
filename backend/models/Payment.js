'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    planId: {
      type: String,
      enum: ['pro', 'institution', 'enterprise'],
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly',
    },
    amount: {
      type: Number,
      required: true, // Amount in paise (e.g., 99900 = ₹999.00)
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['created', 'attempted', 'captured', 'failed', 'refunded'],
      default: 'created',
      index: true,
    },
    method: {
      type: String,
      default: null, // 'upi', 'card', 'netbanking', 'wallet'
    },
    entitlementApplied: {
      type: Boolean,
      default: false,
      index: true,
    },
    errorDescription: {
      type: String,
      default: null,
    },
    notes: {
      type: Schema.Types.Mixed,
      default: {},
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ createdAt: -1 });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

module.exports = Payment;
