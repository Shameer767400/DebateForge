'use strict';

/**
 * @fileoverview Unit tests for billing.controller.js
 * Tests controller handlers directly with mock request/response objects,
 * avoiding localhost socket restrictions and ensuring fast, isolated execution.
 */

const {
  getBillingConfig,
  createOrder,
  verifyPayment,
  handleWebhook,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  checkDebateQuota,
} = require('../controllers/billing.controller');

const razorpayService = require('../services/razorpay.service');
const { User, Payment } = require('../models');

// Helper to create mock req and res
function createMockReqRes(options = {}) {
  const req = {
    body: options.body || {},
    headers: options.headers || {},
    user: options.user || null,
    params: options.params || {},
    query: options.query || {},
    ip: '127.0.0.1',
    get: (header) => options.headers?.[header.toLowerCase()] || '',
    ...options.extra,
  };

  const res = {
    statusCode: 200,
    headers: {},
    _data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this._data = data;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
  };

  return { req, res };
}

describe('Billing Controller Unit Tests', () => {
  const originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  beforeAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret';
  });

  afterAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getBillingConfig', () => {
    it('returns public configuration with currency and pricing', async () => {
      const { req, res } = createMockReqRes();
      await getBillingConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._data).toHaveProperty('currency', 'INR');
      expect(res._data).toHaveProperty('pricing');
      expect(res._data.pricing).toHaveProperty('pro');
      expect(res._data.pricing).toHaveProperty('institution');
      // Must not leak secret credentials
      expect(res._data).not.toHaveProperty('keySecret');
      expect(res._data).not.toHaveProperty('webhookSecret');
    });
  });

  describe('createOrder', () => {
    it('returns 503 if Razorpay credentials are not configured', async () => {
      jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(false);
      const { req, res } = createMockReqRes({
        user: { id: 'user_123', email: 'test@example.com' },
        body: { planId: 'pro', billingCycle: 'monthly' },
      });

      await createOrder(req, res);
      expect(res.statusCode).toBe(503);
      expect(res._data.error).toContain('not configured');
    });

    it('returns 400 if planId is missing or invalid', async () => {
      jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(true);
      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: { planId: 'invalid_plan' },
      });

      await createOrder(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('Invalid plan');
    });

    it('creates an order successfully with trusted server-side pricing', async () => {
      jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(true);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        email: 'test@example.com',
        subscription: { plan: 'free' },
      });
      jest.spyOn(razorpayService, 'createOrder').mockResolvedValue({
        id: 'order_test_123',
        amount: 99900,
        currency: 'INR',
        receipt: 'rcpt_123',
        status: 'created',
      });
      jest.spyOn(Payment, 'create').mockResolvedValue({});

      const { req, res } = createMockReqRes({
        user: { id: '507f1f77bcf86cd799439011' },
        body: { planId: 'pro', billingCycle: 'monthly' },
      });

      await createOrder(req, res);
      expect(res.statusCode).toBe(200);
      expect(res._data.orderId).toBe('order_test_123');
      expect(res._data.amount).toBe(99900);
      expect(res._data.currency).toBe('INR');
      expect(res._data.planId).toBe('pro');
    });
  });

  describe('verifyPayment', () => {
    it('returns 400 if required parameters are missing', async () => {
      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: { razorpay_order_id: 'order_123' }, // missing payment_id and signature
      });

      await verifyPayment(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('Missing payment verification parameters');
    });

    it('returns 400 if cryptographic signature verification fails', async () => {
      jest.spyOn(razorpayService, 'verifyPaymentSignature').mockReturnValue(false);
      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: {
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'invalid_sig',
          planId: 'pro',
        },
      });

      await verifyPayment(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('Invalid payment signature');
    });

    it('activates subscription on valid signature', async () => {
      jest.spyOn(razorpayService, 'verifyPaymentSignature').mockReturnValue(true);
      const mockPayment = {
        _id: 'pay_doc_1',
        userId: 'user_123',
        razorpayOrderId: 'order_123',
        planId: 'pro',
        billingCycle: 'monthly',
        status: 'created',
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment);
      jest.spyOn(razorpayService, 'fetchPayment').mockResolvedValue({ method: 'upi' });
      jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({
        _id: 'user_123',
        subscription: { plan: 'pro', status: 'active' },
      });

      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: {
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'valid_sig',
          planId: 'pro',
          billingCycle: 'monthly',
        },
      });

      await verifyPayment(req, res);
      expect(res.statusCode).toBe(200);
      expect(res._data.success).toBe(true);
      expect(res._data.plan).toBe('pro');
      expect(mockPayment.status).toBe('captured');
      expect(mockPayment.save).toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    it('returns 400 if x-razorpay-signature header is missing', async () => {
      const { req, res } = createMockReqRes({
        headers: {},
        extra: { body: Buffer.from(JSON.stringify({ event: 'payment.captured' })) },
      });

      await handleWebhook(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('x-razorpay-signature');
    });

    it('returns 400 if webhook signature is invalid', async () => {
      jest.spyOn(razorpayService, 'verifyWebhookSignature').mockReturnValue(false);
      const { req, res } = createMockReqRes({
        headers: { 'x-razorpay-signature': 'forged_sig' },
        extra: { body: Buffer.from(JSON.stringify({ event: 'payment.captured' })) },
      });

      await handleWebhook(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('Invalid webhook signature');
    });

    it('acknowledges authentic webhook events with status 200', async () => {
      jest.spyOn(razorpayService, 'verifyWebhookSignature').mockReturnValue(true);
      const mockPaymentRecord = {
        status: 'created',
        userId: '507f1f77bcf86cd799439011',
        planId: 'pro',
        billingCycle: 'monthly',
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPaymentRecord);
      jest.spyOn(Payment, 'findOneAndUpdate').mockResolvedValue({});
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        subscription: { status: 'active' },
      });
      jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({});

      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_capture_123',
              order_id: 'order_123',
              amount: 99900,
              currency: 'INR',
              method: 'upi',
              notes: { userId: '507f1f77bcf86cd799439011', planId: 'pro', billingCycle: 'monthly' },
            },
          },
        },
      };

      const { req, res } = createMockReqRes({
        headers: { 'x-razorpay-signature': 'valid_sig' },
        extra: { body: Buffer.from(JSON.stringify(payload)) },
      });

      await handleWebhook(req, res);
      expect(res.statusCode).toBe(200);
      expect(res._data.received).toBe(true);
    });
  });

  describe('checkDebateQuota middleware', () => {
    const origEnv = process.env.NODE_ENV;
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });
    afterEach(() => {
      process.env.NODE_ENV = origEnv;
    });

    it('allows pro plan users to bypass the free quota check', async () => {
      const next = jest.fn();
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'pro_user_1',
          subscription: { plan: 'pro', status: 'active' },
        }),
      });

      const { req, res } = createMockReqRes({
        user: { id: 'pro_user_1' },
      });

      await checkDebateQuota(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200); // untouched
    });

    it('allows free users who have not exceeded the quota', async () => {
      const next = jest.fn();
      const currentMonth = new Date().toISOString().slice(0, 7);

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'free_user_1',
          subscription: { plan: 'free' },
          freeUsage: { debatesThisMonth: 2, resetMonth: currentMonth },
        }),
      });

      jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue({
        _id: 'free_user_1',
        freeUsage: { debatesThisMonth: 3, resetMonth: currentMonth },
      });

      const { req, res } = createMockReqRes({
        user: { id: 'free_user_1' },
      });

      await checkDebateQuota(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.debateUsage).toBeDefined();
      expect(req.debateUsage.used).toBe(3);
    });

    it('rejects free users who have reached the monthly quota with 402', async () => {
      const next = jest.fn();
      const currentMonth = new Date().toISOString().slice(0, 7);

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'free_user_limit',
          subscription: { plan: 'free' },
          freeUsage: { debatesThisMonth: 5, resetMonth: currentMonth },
        }),
      });
      jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue(null);

      const { req, res } = createMockReqRes({
        user: { id: 'free_user_limit' },
      });

      await checkDebateQuota(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(402);
      expect(res._data.code).toBe('FREE_LIMIT_REACHED');
    });
  });
});
