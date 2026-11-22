'use strict';

const crypto = require('crypto');

// Save original pricing environment overrides before requiring service
const originalPricingEnv = {
  PLAN_PRO_MONTHLY_PAISE: process.env.PLAN_PRO_MONTHLY_PAISE,
  PLAN_PRO_YEARLY_PAISE: process.env.PLAN_PRO_YEARLY_PAISE,
  PLAN_INSTITUTION_MONTHLY_PAISE: process.env.PLAN_INSTITUTION_MONTHLY_PAISE,
  PLAN_INSTITUTION_YEARLY_PAISE: process.env.PLAN_INSTITUTION_YEARLY_PAISE,
};

delete process.env.PLAN_PRO_MONTHLY_PAISE;
delete process.env.PLAN_PRO_YEARLY_PAISE;
delete process.env.PLAN_INSTITUTION_MONTHLY_PAISE;
delete process.env.PLAN_INSTITUTION_YEARLY_PAISE;

const razorpayService = require('../services/razorpay.service');

describe('Razorpay Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.RAZORPAY_KEY_ID = 'rzp_test_1234567890ABCD';
    process.env.RAZORPAY_KEY_SECRET = 'test_secret_key_abcdef123456';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_xyz789';
  });

  afterAll(() => {
    process.env = originalEnv;
    Object.entries(originalPricingEnv).forEach(([key, val]) => {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    });
  });

  describe('Configuration & Key Access', () => {
    it('reports configured when key and secret are present', () => {
      expect(razorpayService.isConfigured()).toBe(true);
      expect(razorpayService.getKeyId()).toBe('rzp_test_1234567890ABCD');
    });

    it('reports not configured when credentials are missing', () => {
      delete process.env.RAZORPAY_KEY_ID;
      expect(razorpayService.isConfigured()).toBe(false);
      expect(razorpayService.getKeyId()).toBe('');
    });
  });

  describe('Pricing Calculations', () => {
    it('returns server-side trusted amount in paise for pro monthly', () => {
      const amount = razorpayService.getPlanAmount('pro', 'monthly');
      expect(amount).toBe(99900); // ₹999.00
    });

    it('returns server-side trusted amount in paise for pro yearly', () => {
      const amount = razorpayService.getPlanAmount('pro', 'yearly');
      expect(amount).toBe(799900); // ₹7,999.00
    });

    it('returns server-side trusted amount for institution monthly', () => {
      const amount = razorpayService.getPlanAmount('institution', 'monthly');
      expect(amount).toBe(2499900); // ₹24,999.00
    });

    it('returns null for unknown plans', () => {
      expect(razorpayService.getPlanAmount('unknown_plan', 'monthly')).toBeNull();
    });
  });

  describe('Payment Signature Verification', () => {
    it('accepts a cryptographically valid HMAC SHA256 payment signature', () => {
      const orderId = 'order_DA1234567890';
      const paymentId = 'pay_9876543210';
      const secret = process.env.RAZORPAY_KEY_SECRET;

      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const result = razorpayService.verifyPaymentSignature({
        orderId,
        paymentId,
        signature: validSignature,
      });

      expect(result).toBe(true);
    });

    it('rejects an invalid or tampered payment signature', () => {
      const orderId = 'order_DA1234567890';
      const paymentId = 'pay_9876543210';

      const result = razorpayService.verifyPaymentSignature({
        orderId,
        paymentId,
        signature: 'invalid_tampered_signature_hex_value_1234567890',
      });

      expect(result).toBe(false);
    });

    it('rejects when orderId or paymentId mismatch', () => {
      const orderId = 'order_ORIGINAL';
      const paymentId = 'pay_ORIGINAL';
      const secret = process.env.RAZORPAY_KEY_SECRET;

      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      // Attempt to verify with a different orderId
      const result = razorpayService.verifyPaymentSignature({
        orderId: 'order_DIFFERENT',
        paymentId,
        signature,
      });

      expect(result).toBe(false);
    });
  });

  describe('Webhook Signature Verification', () => {
    it('validates authentic webhook payloads with matching HMAC signature', () => {
      const payload = JSON.stringify({ event: 'payment.captured', payload: {} });
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const isValid = razorpayService.verifyWebhookSignature(payload, signature);
      expect(isValid).toBe(true);
    });

    it('rejects forged webhook payloads or modified bodies', () => {
      const payload = JSON.stringify({ event: 'payment.captured', payload: {} });
      const tamperedPayload = JSON.stringify({ event: 'payment.captured', payload: { forged: true } });
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const isValid = razorpayService.verifyWebhookSignature(tamperedPayload, signature);
      expect(isValid).toBe(false);
    });
  });
});
