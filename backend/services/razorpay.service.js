'use strict';

/**
 * @fileoverview razorpay.service.js — Centralized Razorpay Service for DebateForge
 *
 * Handles client initialization, server-side trusted pricing, order creation,
 * payment signature verification, and webhook validation.
 */

const crypto = require('crypto');
const Razorpay = require('razorpay');

let _razorpayClient = null;

/**
 * Server-side trusted pricing configuration (in INR paise)
 * 1 INR = 100 paise. Never trust client-submitted amounts.
 */
const PLAN_PRICING = {
  pro: {
    daily:   parseInt(process.env.PLAN_PRO_DAILY_PAISE, 10)   || 4900,       // ₹49
    monthly: parseInt(process.env.PLAN_PRO_MONTHLY_PAISE, 10) || 99900,      // ₹999
    yearly:  parseInt(process.env.PLAN_PRO_YEARLY_PAISE, 10)  || 799900,     // ₹7,999
  },
  institution: {
    monthly: parseInt(process.env.PLAN_INSTITUTION_MONTHLY_PAISE, 10) || 2499900,  // ₹24,999
    yearly:  parseInt(process.env.PLAN_INSTITUTION_YEARLY_PAISE, 10)  || 19999900, // ₹1,99,999
  },
};

/**
 * Check whether Razorpay credentials are set in environment
 */
function isConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * Get public Key ID safely (safe to expose to frontend)
 */
function getKeyId() {
  return process.env.RAZORPAY_KEY_ID || '';
}

/**
 * Lazy-load and return the Razorpay SDK client.
 */
function getClient() {
  if (!_razorpayClient) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
      const err = new Error('Razorpay credentials missing. Ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set.');
      err.code = 'RAZORPAY_NOT_CONFIGURED';
      throw err;
    }

    _razorpayClient = new Razorpay({
      key_id,
      key_secret,
    });
  }
  return _razorpayClient;
}

/**
 * Get trusted plan amount in paise
 * @param {string} planId - 'pro' | 'institution'
 * @param {string} billingCycle - 'monthly' | 'yearly'
 * @returns {number|null} amount in paise
 */
function getPlanAmount(planId, billingCycle = 'monthly') {
  const plan = PLAN_PRICING[planId];
  if (!plan) return null;
  return plan[billingCycle] || null;
}

/**
 * Create a Razorpay Order
 * @param {Object} options
 * @param {number} options.amount - Amount in paise
 * @param {string} options.receipt - Unique receipt string
 * @param {Object} options.notes - Metadata dictionary
 * @returns {Promise<Object>} Razorpay order object
 */
async function createOrder({ amount, receipt, notes = {} }) {
  const client = getClient();
  const options = {
    amount,
    currency: 'INR',
    receipt: String(receipt).slice(0, 40), // Razorpay limits receipt to 40 chars
    notes,
  };

  return await client.orders.create(options);
}

/**
 * Verify Razorpay payment signature
 * signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret)
 *
 * @param {Object} params
 * @param {string} params.orderId
 * @param {string} params.paymentId
 * @param {string} params.signature
 * @returns {boolean} true if valid
 */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) {
    return false;
  }

  try {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    // Use timingSafeEqual to avoid timing attacks
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch (err) {
    console.error('[RazorpayService] Signature verification exception:', err.message);
    return false;
  }
}

/**
 * Verify Razorpay Webhook signature
 * signature = HMAC-SHA256(raw_body, webhook_secret)
 *
 * @param {string|Buffer} rawBody
 * @param {string} signature
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody || !signature) {
    return false;
  }

  try {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch (err) {
    console.error('[RazorpayService] Webhook signature verification error:', err.message);
    return false;
  }
}

/**
 * Fetch a payment detail from Razorpay
 * @param {string} paymentId
 */
async function fetchPayment(paymentId) {
  const client = getClient();
  return await client.payments.fetch(paymentId);
}

/**
 * Fetch an order detail from Razorpay
 * @param {string} orderId
 */
async function fetchOrder(orderId) {
  const client = getClient();
  return await client.orders.fetch(orderId);
}

/**
 * Fetch payments associated with an order from Razorpay
 * @param {string} orderId
 */
async function fetchOrderPayments(orderId) {
  const client = getClient();
  return await client.orders.fetchPayments(orderId);
}

module.exports = {
  isConfigured,
  getKeyId,
  getClient,
  getPlanAmount,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPayment,
  fetchOrder,
  fetchOrderPayments,
  PLAN_PRICING,
};
