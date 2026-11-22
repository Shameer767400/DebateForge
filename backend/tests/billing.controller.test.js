'use strict';

/**
 * @fileoverview Comprehensive unit and integration test suite for billing.controller.js
 * Covers multi-document ACID transactions, rollback atomicity, transient retry handling,
 * unknown commit result handling, concurrent renewal stacking, idempotency, delayed duplicate webhooks,
 * daily reconciliation, and real-time quota gates.
 */

const mongoose = require('mongoose');
const {
  getBillingConfig,
  createOrder,
  verifyPayment,
  handleWebhook,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  checkDebateQuota,
  applyPaymentEntitlement,
} = require('../controllers/billing.controller');

const {
  expireStalePrepaidPasses,
  reconcileOrphanedPayments,
} = require('../jobs/notifications.job');

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
    _enforceQuotaInTest: options.enforceQuotaInTest ?? true,
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

describe('Billing Controller Unit Tests (Mocked Sessions)', () => {
  const originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  let mockSession;

  beforeAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret';
  });

  afterAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;
  });

  beforeEach(() => {
    mockSession = {
      withTransaction: jest.fn(async (callback) => {
        return await callback();
      }),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /* ─────────────────────────────────────────────────────────────
     1. Public Billing Config
  ───────────────────────────────────────────────────────────── */
  describe('getBillingConfig', () => {
    it('returns public configuration with currency and pricing without leaking secrets', async () => {
      const { req, res } = createMockReqRes();
      await getBillingConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._data).toHaveProperty('currency', 'INR');
      expect(res._data).toHaveProperty('pricing');
      expect(res._data.pricing).toHaveProperty('pro');
      expect(res._data.pricing).toHaveProperty('institution');
      expect(res._data).not.toHaveProperty('keySecret');
      expect(res._data).not.toHaveProperty('webhookSecret');
    });
  });

  /* ─────────────────────────────────────────────────────────────
     2. Order Creation & Cross-Tier Protection
  ───────────────────────────────────────────────────────────── */
  describe('createOrder & Cross-Tier Protection', () => {
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

    it('returns 400 if planId is invalid', async () => {
      jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(true);
      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: { planId: 'invalid_tier' },
      });

      await createOrder(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('Invalid plan');
    });

    it('allows an active user to purchase an early renewal for the same plan', async () => {
      jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(true);
      const futureExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'user_123',
        username: 'active_debater',
        email: 'debater@example.com',
        subscription: {
          plan: 'pro',
          status: 'active',
          currentPeriodEnd: futureExpiry,
        },
      });

      jest.spyOn(razorpayService, 'createOrder').mockResolvedValue({
        id: 'order_early_renewal_123',
        amount: 99900,
        currency: 'INR',
        receipt: 'rcpt_123',
      });
      jest.spyOn(Payment, 'create').mockResolvedValue({});

      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: { planId: 'pro', billingCycle: 'monthly' },
      });

      await createOrder(req, res);
      expect(res.statusCode).toBe(200);
      expect(res._data.orderId).toBe('order_early_renewal_123');
      expect(res._data.amount).toBe(99900);
    });

    it('prevents cross-tier change from overwriting an active pass', async () => {
      jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(true);
      const futureExpiry = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'user_123',
        subscription: {
          plan: 'institution',
          status: 'active',
          currentPeriodEnd: futureExpiry,
        },
      });

      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: { planId: 'pro', billingCycle: 'monthly' },
      });

      await createOrder(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('Cross-tier changes cannot overwrite an existing active pass');
    });
  });

  /* ─────────────────────────────────────────────────────────────
     3. Security Verification: Amount, Currency, Forged Plan (F11, F12)
  ───────────────────────────────────────────────────────────── */
  describe('verifyPayment Security & Parameter Integrity', () => {
    it('ignores client-supplied forged planId and uses trusted Payment record (F11)', async () => {
      jest.spyOn(razorpayService, 'verifyPaymentSignature').mockReturnValue(true);
      const mockPayment = {
        _id: 'pay_doc_pro',
        userId: 'user_123',
        razorpayOrderId: 'order_pro_123',
        planId: 'pro',
        billingCycle: 'monthly',
        amount: 99900,
        currency: 'INR',
        status: 'created',
        entitlementApplied: false,
      };
      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment);
      jest.spyOn(Payment, 'findById').mockResolvedValue(mockPayment);
      jest.spyOn(Payment, 'findByIdAndUpdate').mockResolvedValue({ ...mockPayment, entitlementApplied: true, status: 'captured' });
      jest.spyOn(razorpayService, 'fetchPayment').mockResolvedValue({
        status: 'captured',
        amount: 99900,
        currency: 'INR',
        order_id: 'order_pro_123',
        method: 'upi',
      });

      const updatedUserMock = {
        _id: 'user_123',
        username: 'attacker',
        subscription: { plan: 'pro', billingCycle: 'monthly', status: 'active', currentPeriodEnd: new Date() },
      };
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'user_123', subscription: {} });
      jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(updatedUserMock);

      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: {
          razorpay_order_id: 'order_pro_123',
          razorpay_payment_id: 'pay_pro_123',
          razorpay_signature: 'valid_sig',
          planId: 'institution', // FORGED!
          billingCycle: 'yearly', // FORGED!
        },
      });

      await verifyPayment(req, res);
      expect(res.statusCode).toBe(200);
      expect(res._data.plan).toBe('pro');
      expect(res._data.billingCycle).toBe('monthly');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user_123',
        expect.objectContaining({
          $set: expect.objectContaining({
            'subscription.plan': 'pro',
            'subscription.billingCycle': 'monthly',
          }),
        }),
        expect.any(Object)
      );
    });

    it('rejects verification if captured amount differs from stored order amount (F12)', async () => {
      jest.spyOn(razorpayService, 'verifyPaymentSignature').mockReturnValue(true);
      const mockPayment = {
        _id: 'pay_123',
        userId: 'user_123',
        razorpayOrderId: 'order_123',
        amount: 99900,
        currency: 'INR',
      };
      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment);
      jest.spyOn(razorpayService, 'fetchPayment').mockResolvedValue({
        status: 'captured',
        amount: 10000,
        currency: 'INR',
        order_id: 'order_123',
      });

      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: {
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'valid_sig',
        },
      });

      await verifyPayment(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('amount mismatch');
    });

    it('rejects verification if currency mismatches (F12)', async () => {
      jest.spyOn(razorpayService, 'verifyPaymentSignature').mockReturnValue(true);
      const mockPayment = {
        _id: 'pay_123',
        userId: 'user_123',
        razorpayOrderId: 'order_123',
        amount: 99900,
        currency: 'INR',
      };
      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment);
      jest.spyOn(razorpayService, 'fetchPayment').mockResolvedValue({
        status: 'captured',
        amount: 99900,
        currency: 'USD',
        order_id: 'order_123',
      });

      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: {
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'valid_sig',
        },
      });

      await verifyPayment(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('currency mismatch');
    });

    it('rejects verification if payment is not captured (F12)', async () => {
      jest.spyOn(razorpayService, 'verifyPaymentSignature').mockReturnValue(true);
      const mockPayment = {
        _id: 'pay_123',
        userId: 'user_123',
        razorpayOrderId: 'order_123',
        amount: 99900,
        currency: 'INR',
      };
      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment);
      jest.spyOn(razorpayService, 'fetchPayment').mockResolvedValue({
        status: 'failed',
        amount: 99900,
        currency: 'INR',
        order_id: 'order_123',
      });

      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: {
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'valid_sig',
        },
      });

      await verifyPayment(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('Payment is not captured');
    });

    it('rejects verification if order ID mismatches (F12)', async () => {
      jest.spyOn(razorpayService, 'verifyPaymentSignature').mockReturnValue(true);
      const mockPayment = {
        _id: 'pay_123',
        userId: 'user_123',
        razorpayOrderId: 'order_expected_123',
        amount: 99900,
        currency: 'INR',
      };
      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment);
      jest.spyOn(razorpayService, 'fetchPayment').mockResolvedValue({
        status: 'captured',
        amount: 99900,
        currency: 'INR',
        order_id: 'order_different_999',
      });

      const { req, res } = createMockReqRes({
        user: { id: 'user_123' },
        body: {
          razorpay_order_id: 'order_expected_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'valid_sig',
        },
      });

      await verifyPayment(req, res);
      expect(res.statusCode).toBe(400);
      expect(res._data.error).toContain('order ID mismatch');
    });

    it('rejects verification if payment belongs to another user', async () => {
      jest.spyOn(razorpayService, 'verifyPaymentSignature').mockReturnValue(true);
      const mockPayment = {
        _id: 'pay_123',
        userId: 'victim_user_456',
        razorpayOrderId: 'order_123',
      };
      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment);

      const { req, res } = createMockReqRes({
        user: { id: 'attacker_user_789' },
        body: {
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'valid_sig',
        },
      });

      await verifyPayment(req, res);
      expect(res.statusCode).toBe(403);
      expect(res._data.error).toContain('Payment does not belong to current user');
    });
  });

  /* ─────────────────────────────────────────────────────────────
     4. Multi-Document ACID Transactions (F1, F2, F7, F8)
  ───────────────────────────────────────────────────────────── */
  describe('applyPaymentEntitlement ACID Transactions', () => {
    it('successfully commits Payment and User updates together in a transaction (F1)', async () => {
      const mockPayment = {
        _id: 'pay_m1',
        userId: 'u1',
        planId: 'pro',
        billingCycle: 'monthly',
        razorpayOrderId: 'ord_m1',
        entitlementApplied: false,
        status: 'created',
      };

      jest.spyOn(Payment, 'findById').mockResolvedValue(mockPayment);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u1',
        subscription: { plan: 'free', status: 'none', currentPeriodEnd: null, appliedOrderIds: [] },
      });

      let capturedUserUpdate = null;
      let capturedPaymentUpdate = null;
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementation((id, update) => {
        capturedUserUpdate = update;
        return { _id: id, subscription: update.$set };
      });
      jest.spyOn(Payment, 'findByIdAndUpdate').mockImplementation((id, update) => {
        capturedPaymentUpdate = update;
        return { _id: id, ...mockPayment, ...update.$set };
      });

      const before = Date.now();
      const result = await applyPaymentEntitlement({
        payment: mockPayment,
        razorpayPaymentId: 'rzp_1',
        razorpaySignature: 'sig_1',
        paymentMethod: 'upi',
      });
      const after = Date.now();

      expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
      expect(result.alreadyApplied).toBe(false);
      expect(capturedUserUpdate.$set['subscription.plan']).toBe('pro');
      expect(capturedUserUpdate.$addToSet['subscription.appliedOrderIds']).toBe('ord_m1');
      expect(capturedPaymentUpdate.$set.status).toBe('captured');
      expect(capturedPaymentUpdate.$set.entitlementApplied).toBe(true);

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const expiryMs = new Date(capturedUserUpdate.$set['subscription.currentPeriodEnd']).getTime();
      expect(expiryMs).toBeGreaterThanOrEqual(before + thirtyDaysMs);
      expect(expiryMs).toBeLessThanOrEqual(after + thirtyDaysMs);
    });

    it('rolls back Payment and User updates together when User update fails (F2)', async () => {
      const mockPayment = {
        _id: 'pay_fail_tx',
        userId: 'u_fail',
        planId: 'pro',
        billingCycle: 'monthly',
        razorpayOrderId: 'ord_fail',
        entitlementApplied: false,
        status: 'created',
      };

      jest.spyOn(Payment, 'findById').mockResolvedValue(mockPayment);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_fail',
        subscription: { plan: 'free', status: 'none' },
      });

      // Simulate database crash during User update inside the transaction
      jest.spyOn(User, 'findByIdAndUpdate').mockRejectedValue(new Error('Mongo Network Timeout'));
      const paymentUpdateSpy = jest.spyOn(Payment, 'findByIdAndUpdate');

      mockSession.withTransaction = jest.fn(async (callback) => {
        // When callback throws, transaction rolls back
        return await callback();
      });

      await expect(
        applyPaymentEntitlement({
          payment: mockPayment,
          razorpayPaymentId: 'rzp_fail',
          razorpaySignature: 'sig_fail',
        })
      ).rejects.toThrow('Mongo Network Timeout');

      expect(paymentUpdateSpy).not.toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('retries on TransientTransactionError and succeeds on subsequent attempt (F7)', async () => {
      const mockPayment = {
        _id: 'pay_transient',
        userId: 'u_transient',
        planId: 'pro',
        billingCycle: 'monthly',
        razorpayOrderId: 'ord_transient',
        entitlementApplied: false,
        status: 'created',
      };

      jest.spyOn(Payment, 'findById').mockResolvedValue(mockPayment);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_transient',
        subscription: { plan: 'free', status: 'none' },
      });
      jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({ _id: 'u_transient' });
      jest.spyOn(Payment, 'findByIdAndUpdate').mockResolvedValue({ _id: 'pay_transient', entitlementApplied: true });

      let attempts = 0;
      mockSession.withTransaction = jest.fn(async (callback) => {
        attempts++;
        if (attempts === 1) {
          const transientErr = new Error('WriteConflict error');
          transientErr.hasErrorLabel = (label) => label === 'TransientTransactionError';
          throw transientErr;
        }
        return await callback();
      });

      const result = await applyPaymentEntitlement({
        payment: mockPayment,
        razorpayPaymentId: 'rzp_tx',
      });

      expect(attempts).toBe(2);
      expect(result.alreadyApplied).toBe(false);
    });

    it('retries on UnknownTransactionCommitResult and safely resolves (F8)', async () => {
      const mockPayment = {
        _id: 'pay_unknown_commit',
        userId: 'u_commit',
        planId: 'pro',
        billingCycle: 'monthly',
        razorpayOrderId: 'ord_commit',
        entitlementApplied: false,
        status: 'created',
      };

      jest.spyOn(Payment, 'findById').mockResolvedValue(mockPayment);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_commit',
        subscription: { plan: 'free', status: 'none' },
      });
      jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({ _id: 'u_commit' });
      jest.spyOn(Payment, 'findByIdAndUpdate').mockResolvedValue({ _id: 'pay_unknown_commit', entitlementApplied: true });

      let attempts = 0;
      mockSession.withTransaction = jest.fn(async (callback) => {
        attempts++;
        if (attempts === 1) {
          const commitErr = new Error('Socket closed before commit response');
          commitErr.hasErrorLabel = (label) => label === 'UnknownTransactionCommitResult';
          throw commitErr;
        }
        return await callback();
      });

      const result = await applyPaymentEntitlement({
        payment: mockPayment,
        razorpayPaymentId: 'rzp_commit',
      });

      expect(attempts).toBe(2);
      expect(result.alreadyApplied).toBe(false);
    });
  });

  /* ─────────────────────────────────────────────────────────────
     5. Concurrency, Duplicate & Delayed Webhook Idempotency (F3, F4, F5, F6)
  ───────────────────────────────────────────────────────────── */
  describe('Concurrency & Idempotency Safeguards', () => {
    it('duplicate webhook exits immediately without duplicate extension (F3)', async () => {
      const mockPayment = {
        _id: 'pay_dup',
        userId: 'u_dup',
        planId: 'pro',
        billingCycle: 'monthly',
        amount: 99900,
        currency: 'INR',
        razorpayOrderId: 'ord_dup',
        status: 'captured',
        entitlementApplied: true, // Already finalized
      };

      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_dup',
        subscription: { plan: 'pro', status: 'active', currentPeriodEnd: new Date() },
      });
      const userUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate');

      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: { id: 'rzp_dup', order_id: 'ord_dup', amount: 99900, currency: 'INR', method: 'card', status: 'captured' },
          },
        },
      };

      const { req, res } = createMockReqRes({
        headers: { 'x-razorpay-signature': 'valid_sig' },
        extra: { body: Buffer.from(JSON.stringify(payload)) },
      });
      jest.spyOn(razorpayService, 'verifyWebhookSignature').mockReturnValue(true);

      await handleWebhook(req, res);
      expect(res.statusCode).toBe(200);
      expect(res._data.received).toBe(true);
      expect(userUpdateSpy).not.toHaveBeenCalled();
    });

    it('delayed duplicate webhook for older payment after a later renewal does not alter duration (F4)', async () => {
      // Order 1 was on Monday. Order 2 was applied on Wednesday, extending pass to Day 70.
      const futureExpiryDay70 = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);
      const mockPayment1 = {
        _id: 'pay_order_1',
        userId: 'u_stacked',
        planId: 'pro',
        billingCycle: 'monthly',
        amount: 99900,
        currency: 'INR',
        razorpayOrderId: 'order_1',
        status: 'captured',
        entitlementApplied: true, // Order 1 was already applied
      };

      jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment1);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_stacked',
        subscription: {
          plan: 'pro',
          status: 'active',
          razorpayOrderId: 'order_2', // User currently shows Order 2 as latest
          currentPeriodEnd: futureExpiryDay70,
          appliedOrderIds: ['order_1', 'order_2'], // Contains both
        },
      });

      const userUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate');

      // Delayed duplicate webhook arrives for order_1
      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: { id: 'rzp_pay_1', order_id: 'order_1', amount: 99900, currency: 'INR', method: 'upi', status: 'captured' },
          },
        },
      };

      const { req, res } = createMockReqRes({
        headers: { 'x-razorpay-signature': 'valid_sig' },
        extra: { body: Buffer.from(JSON.stringify(payload)) },
      });
      jest.spyOn(razorpayService, 'verifyWebhookSignature').mockReturnValue(true);

      await handleWebhook(req, res);
      expect(res.statusCode).toBe(200);
      expect(userUpdateSpy).not.toHaveBeenCalled(); // Preserves Day 70 without adding duplicate 30 days
    });

    describe('handleWebhook Strict Security Validation', () => {
      beforeEach(() => {
        jest.spyOn(razorpayService, 'verifyWebhookSignature').mockReturnValue(true);
      });

      it('rejects webhook when payment entity is missing required fields', async () => {
        const payload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: { order_id: 'ord_123', status: 'captured' }, // missing id
            },
          },
        };
        const { req, res } = createMockReqRes({
          headers: { 'x-razorpay-signature': 'valid_sig' },
          extra: { body: Buffer.from(JSON.stringify(payload)) },
        });

        await handleWebhook(req, res);
        expect(res.statusCode).toBe(400);
        expect(res._data.error).toBe('Missing order_id or payment ID');
      });

      it('rejects webhook when payment status is not captured', async () => {
        const mockPayment = {
          _id: 'pay_failed_doc',
          razorpayOrderId: 'ord_failed',
          amount: 99900,
          currency: 'INR',
        };
        jest.spyOn(Payment, 'findOne').mockResolvedValue(mockPayment);

        const payload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: { id: 'pay_failed', order_id: 'ord_failed', amount: 99900, status: 'failed' },
            },
          },
        };
        const { req, res } = createMockReqRes({
          headers: { 'x-razorpay-signature': 'valid_sig' },
          extra: { body: Buffer.from(JSON.stringify(payload)) },
        });

        await handleWebhook(req, res);
        expect(res.statusCode).toBe(400);
        expect(res._data.error).toBe('Payment status is not captured');
      });

      it('rejects webhook when payment order is not found', async () => {
        jest.spyOn(Payment, 'findOne').mockResolvedValue(null);
        const payload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: { id: 'pay_unknown', order_id: 'ord_unknown', amount: 99900, status: 'captured' },
            },
          },
        };
        const { req, res } = createMockReqRes({
          headers: { 'x-razorpay-signature': 'valid_sig' },
          extra: { body: Buffer.from(JSON.stringify(payload)) },
        });

        await handleWebhook(req, res);
        expect(res.statusCode).toBe(404);
        expect(res._data.error).toBe('Associated payment order record not found');
      });

      it('rejects webhook when amount mismatches stored payment', async () => {
        jest.spyOn(Payment, 'findOne').mockResolvedValue({
          _id: 'pay_amt_mismatch',
          razorpayOrderId: 'ord_amt',
          amount: 99900,
          currency: 'INR',
        });
        const payload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: { id: 'pay_amt', order_id: 'ord_amt', amount: 10000, currency: 'INR', status: 'captured' },
            },
          },
        };
        const { req, res } = createMockReqRes({
          headers: { 'x-razorpay-signature': 'valid_sig' },
          extra: { body: Buffer.from(JSON.stringify(payload)) },
        });

        await handleWebhook(req, res);
        expect(res.statusCode).toBe(400);
        expect(res._data.error).toBe('Payment amount mismatch');
      });

      it('rejects webhook when currency mismatches stored payment', async () => {
        jest.spyOn(Payment, 'findOne').mockResolvedValue({
          _id: 'pay_curr_mismatch',
          razorpayOrderId: 'ord_curr',
          amount: 99900,
          currency: 'INR',
        });
        const payload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: { id: 'pay_curr', order_id: 'ord_curr', amount: 99900, currency: 'USD', status: 'captured' },
            },
          },
        };
        const { req, res } = createMockReqRes({
          headers: { 'x-razorpay-signature': 'valid_sig' },
          extra: { body: Buffer.from(JSON.stringify(payload)) },
        });

        await handleWebhook(req, res);
        expect(res.statusCode).toBe(400);
        expect(res._data.error).toBe('Payment currency mismatch');
      });

      it('rejects webhook when payment ID mismatches existing captured payment', async () => {
        jest.spyOn(Payment, 'findOne').mockResolvedValue({
          _id: 'pay_id_mismatch',
          razorpayOrderId: 'ord_id_test',
          razorpayPaymentId: 'pay_legit_original',
          amount: 99900,
          currency: 'INR',
        });
        const payload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: { id: 'pay_diff_rogue', order_id: 'ord_id_test', amount: 99900, currency: 'INR', status: 'captured' },
            },
          },
        };
        const { req, res } = createMockReqRes({
          headers: { 'x-razorpay-signature': 'valid_sig' },
          extra: { body: Buffer.from(JSON.stringify(payload)) },
        });

        await handleWebhook(req, res);
        expect(res.statusCode).toBe(400);
        expect(res._data.error).toBe('Payment ID mismatch with existing record');
      });

      it('does not overwrite captured payment on payment.failed event', async () => {
        const findOneAndUpdateSpy = jest.spyOn(Payment, 'findOneAndUpdate').mockResolvedValue(null);
        const payload = {
          event: 'payment.failed',
          payload: {
            payment: {
              entity: { id: 'pay_failed_attempt', order_id: 'ord_already_captured', error_description: 'Card declined' },
            },
          },
        };
        const { req, res } = createMockReqRes({
          headers: { 'x-razorpay-signature': 'valid_sig' },
          extra: { body: Buffer.from(JSON.stringify(payload)) },
        });

        await handleWebhook(req, res);
        expect(res.statusCode).toBe(200);
        expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            razorpayOrderId: 'ord_already_captured',
            status: { $ne: 'captured' },
            entitlementApplied: { $ne: true },
          }),
          expect.any(Object)
        );
      });
    });

    it('preserves active higher-tier plan (institution) and existing period end when a lower-tier payment is processed', async () => {
      const futureExpiry = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
      const proPayment = {
        _id: 'pay_pro_downgrade',
        userId: 'u_institution_user',
        planId: 'pro',
        billingCycle: 'monthly',
        razorpayOrderId: 'ord_pro_lower',
        entitlementApplied: false,
        status: 'created',
      };

      jest.spyOn(Payment, 'findById').mockResolvedValue(proPayment);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_institution_user',
        subscription: {
          plan: 'institution',
          status: 'active',
          currentPeriodEnd: futureExpiry,
          appliedOrderIds: [],
        },
      });

      let updatedFields = null;
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementation((id, update) => {
        updatedFields = update.$set;
        return { _id: id, subscription: update.$set };
      });
      jest.spyOn(Payment, 'findByIdAndUpdate').mockResolvedValue({ ...proPayment, entitlementApplied: true });

      const result = await applyPaymentEntitlement({
        payment: proPayment,
        razorpayPaymentId: 'pay_pro_123',
      });

      expect(result.success).toBe(true);
      expect(updatedFields['subscription.plan']).toBe('institution');
      expect(new Date(updatedFields['subscription.currentPeriodEnd']).getTime()).toBe(futureExpiry.getTime());
    });

    it('two different concurrent renewal payments preserve both durations (F5)', async () => {
      const now = Date.now();
      const initialExpiry = new Date(now + 10 * 24 * 60 * 60 * 1000); // 10 days remaining

      // Payment A (+30d)
      const paymentA = {
        _id: 'pay_A',
        userId: 'u_stack_user',
        planId: 'pro',
        billingCycle: 'monthly',
        razorpayOrderId: 'ord_A',
        entitlementApplied: false,
        status: 'created',
      };

      // Payment B (+30d)
      const paymentB = {
        _id: 'pay_B',
        userId: 'u_stack_user',
        planId: 'pro',
        billingCycle: 'monthly',
        razorpayOrderId: 'ord_B',
        entitlementApplied: false,
        status: 'created',
      };

      // Simulate Payment A committing first, advancing expiry to 10 + 30 = 40 days
      const afterPaymentAExpiry = new Date(initialExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Payment A execution
      jest.spyOn(Payment, 'findById').mockResolvedValueOnce(paymentA);
      jest.spyOn(User, 'findById').mockResolvedValueOnce({
        _id: 'u_stack_user',
        subscription: {
          plan: 'pro',
          status: 'active',
          currentPeriodEnd: initialExpiry,
          appliedOrderIds: [],
        },
      });
      let expirySetByA = null;
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((id, update) => {
        expirySetByA = update.$set['subscription.currentPeriodEnd'];
        return { _id: id, subscription: update.$set };
      });
      jest.spyOn(Payment, 'findByIdAndUpdate').mockResolvedValueOnce({ ...paymentA, entitlementApplied: true });

      await applyPaymentEntitlement({ payment: paymentA, razorpayPaymentId: 'rzp_A' });
      expect(new Date(expirySetByA).getTime()).toBe(afterPaymentAExpiry.getTime());

      // Payment B execution reads newly committed state from Payment A
      jest.spyOn(Payment, 'findById').mockResolvedValueOnce(paymentB);
      jest.spyOn(User, 'findById').mockResolvedValueOnce({
        _id: 'u_stack_user',
        subscription: {
          plan: 'pro',
          status: 'active',
          currentPeriodEnd: afterPaymentAExpiry, // Reads Day 40!
          appliedOrderIds: ['ord_A'],
        },
      });
      let expirySetByB = null;
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((id, update) => {
        expirySetByB = update.$set['subscription.currentPeriodEnd'];
        return { _id: id, subscription: update.$set };
      });
      jest.spyOn(Payment, 'findByIdAndUpdate').mockResolvedValueOnce({ ...paymentB, entitlementApplied: true });

      await applyPaymentEntitlement({ payment: paymentB, razorpayPaymentId: 'rzp_B' });
      const expectedFinalExpiry = initialExpiry.getTime() + 60 * 24 * 60 * 60 * 1000;
      expect(new Date(expirySetByB).getTime()).toBe(expectedFinalExpiry);
    });

    it('two simultaneous requests for the same payment resolve without double credit (F6)', async () => {
      const paymentDoc = {
        _id: 'pay_simultaneous',
        userId: 'u_sim',
        planId: 'pro',
        billingCycle: 'monthly',
        razorpayOrderId: 'ord_sim',
        entitlementApplied: false,
        status: 'created',
      };

      // First call sees entitlementApplied: false and updates
      jest.spyOn(Payment, 'findById')
        .mockResolvedValueOnce(paymentDoc)
        // Second call inside transaction sees entitlementApplied: true
        .mockResolvedValueOnce({ ...paymentDoc, entitlementApplied: true, status: 'captured' });

      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_sim',
        subscription: { plan: 'free', status: 'none', currentPeriodEnd: null },
      });
      const userUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({ _id: 'u_sim' });
      jest.spyOn(Payment, 'findByIdAndUpdate').mockResolvedValue({ ...paymentDoc, entitlementApplied: true });

      const res1 = await applyPaymentEntitlement({ payment: paymentDoc, razorpayPaymentId: 'rzp_sim1' });
      const res2 = await applyPaymentEntitlement({ payment: paymentDoc, razorpayPaymentId: 'rzp_sim2' });

      expect(res1.alreadyApplied).toBe(false);
      expect(res2.alreadyApplied).toBe(true);
      expect(userUpdateSpy).toHaveBeenCalledTimes(1); // Exactly one update!
    });
  });

  /* ─────────────────────────────────────────────────────────────
     6. Daily Reconciliation Worker (F9, F10)
  ───────────────────────────────────────────────────────────── */
  describe('reconcileOrphanedPayments Worker', () => {
    it('reconciles captured but unapplied payments from Razorpay API (F9)', async () => {
      jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(true);

      const stalePayment = {
        _id: 'pay_orphaned_1',
        userId: 'u_recov',
        razorpayOrderId: 'order_orphaned_1',
        amount: 99900,
        currency: 'INR',
        planId: 'pro',
        billingCycle: 'monthly',
        status: 'created',
        entitlementApplied: false,
        createdAt: new Date(Date.now() - 40 * 60 * 1000), // 40 mins ago
      };

      jest.spyOn(Payment, 'find').mockReturnValue({
        limit: jest.fn().mockResolvedValue([stalePayment]),
      });

      jest.spyOn(razorpayService, 'fetchOrder').mockResolvedValue({
        id: 'order_orphaned_1',
        status: 'paid',
        amount_paid: 99900,
      });

      jest.spyOn(razorpayService, 'fetchOrderPayments').mockResolvedValue({
        items: [{ id: 'pay_captured_recov', order_id: 'order_orphaned_1', status: 'captured', amount: 99900, currency: 'INR', method: 'netbanking' }],
      });

      jest.spyOn(Payment, 'findById').mockResolvedValue(stalePayment);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_recov',
        subscription: { plan: 'free', status: 'none' },
      });
      const userUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({ _id: 'u_recov' });
      jest.spyOn(Payment, 'findByIdAndUpdate').mockResolvedValue({ ...stalePayment, entitlementApplied: true });

      const result = await reconcileOrphanedPayments();
      expect(result.checked).toBe(1);
      expect(result.reconciled).toBe(1);
      expect(userUpdateSpy).toHaveBeenCalled();
    });

    it('does not mark payment failed when Razorpay API throws transient network error (F10)', async () => {
      jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(true);

      const stalePayment = {
        _id: 'pay_timeout_order',
        userId: 'u_timeout',
        razorpayOrderId: 'order_timeout',
        amount: 99900,
        status: 'created',
        entitlementApplied: false,
        createdAt: new Date(Date.now() - 45 * 60 * 1000),
      };

      jest.spyOn(Payment, 'find').mockReturnValue({
        limit: jest.fn().mockResolvedValue([stalePayment]),
      });

      // Transient timeout from Razorpay
      jest.spyOn(razorpayService, 'fetchOrder').mockRejectedValue(new Error('Gateway ETIMEDOUT'));
      const paymentUpdateSpy = jest.spyOn(Payment, 'findByIdAndUpdate');

      const result = await reconcileOrphanedPayments();
      expect(result.checked).toBe(1);
      expect(result.reconciled).toBe(0);
      expect(paymentUpdateSpy).not.toHaveBeenCalled(); // MUST NOT mark failed on network error!
    });

    it('rejects reconciliation when payments have missing or mismatched status, ID, order, amount, or currency', async () => {
      jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(true);

      const stalePayment = {
        _id: 'pay_orphaned_strict',
        userId: 'u_strict',
        razorpayOrderId: 'order_strict_1',
        amount: 99900,
        currency: 'INR',
        status: 'created',
        entitlementApplied: false,
        createdAt: new Date(Date.now() - 40 * 60 * 1000),
      };

      jest.spyOn(Payment, 'find').mockReturnValue({
        limit: jest.fn().mockResolvedValue([stalePayment]),
      });

      jest.spyOn(razorpayService, 'fetchOrder').mockResolvedValue({
        id: 'order_strict_1',
        status: 'paid',
        amount_paid: 99900,
      });

      // Provide items with various missing or mismatched fields:
      // 1: missing currency
      // 2: amount mismatch
      // 3: uncaptured status
      // 4: missing order_id
      // 5: invalid payment ID
      jest.spyOn(razorpayService, 'fetchOrderPayments').mockResolvedValue({
        items: [
          { id: 'pay_item_1', order_id: 'order_strict_1', status: 'captured', amount: 99900 }, // missing currency
          { id: 'pay_item_2', order_id: 'order_strict_1', status: 'captured', amount: 50000, currency: 'INR' }, // amount mismatch
          { id: 'pay_item_3', order_id: 'order_strict_1', status: 'failed', amount: 99900, currency: 'INR' }, // uncaptured
          { id: 'pay_item_4', status: 'captured', amount: 99900, currency: 'INR' }, // missing order_id
          { id: 'invalid_id', order_id: 'order_strict_1', status: 'captured', amount: 99900, currency: 'INR' }, // invalid ID
        ],
      });

      const userUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate');
      const result = await reconcileOrphanedPayments();

      expect(result.checked).toBe(1);
      expect(result.reconciled).toBe(0); // None should be reconciled!
      expect(userUpdateSpy).not.toHaveBeenCalled();
    });

    describe('strict reconciliation stored currency validation', () => {
      beforeEach(() => {
        jest.spyOn(razorpayService, 'isConfigured').mockReturnValue(true);
      });

      it('rejects candidate when stored currency is missing (undefined)', async () => {
        const candidate = {
          _id: 'pay_missing_curr',
          userId: 'u_curr',
          razorpayOrderId: 'order_curr_1',
          amount: 99900,
          // currency is undefined
          status: 'created',
          entitlementApplied: false,
          createdAt: new Date(Date.now() - 40 * 60 * 1000),
        };
        jest.spyOn(Payment, 'find').mockReturnValue({
          limit: jest.fn().mockResolvedValue([candidate]),
        });
        const userUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate');
        const result = await reconcileOrphanedPayments();

        expect(result.checked).toBe(1);
        expect(result.reconciled).toBe(0);
        expect(userUpdateSpy).not.toHaveBeenCalled();
      });

      it('rejects candidate when stored currency is null', async () => {
        const candidate = {
          _id: 'pay_null_curr',
          userId: 'u_curr',
          razorpayOrderId: 'order_curr_2',
          amount: 99900,
          currency: null,
          status: 'created',
          entitlementApplied: false,
          createdAt: new Date(Date.now() - 40 * 60 * 1000),
        };
        jest.spyOn(Payment, 'find').mockReturnValue({
          limit: jest.fn().mockResolvedValue([candidate]),
        });
        const userUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate');
        const result = await reconcileOrphanedPayments();

        expect(result.checked).toBe(1);
        expect(result.reconciled).toBe(0);
        expect(userUpdateSpy).not.toHaveBeenCalled();
      });

      it('rejects candidate when stored currency is empty string or whitespace', async () => {
        const candidate = {
          _id: 'pay_empty_curr',
          userId: 'u_curr',
          razorpayOrderId: 'order_curr_3',
          amount: 99900,
          currency: '   ',
          status: 'created',
          entitlementApplied: false,
          createdAt: new Date(Date.now() - 40 * 60 * 1000),
        };
        jest.spyOn(Payment, 'find').mockReturnValue({
          limit: jest.fn().mockResolvedValue([candidate]),
        });
        const userUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate');
        const result = await reconcileOrphanedPayments();

        expect(result.checked).toBe(1);
        expect(result.reconciled).toBe(0);
        expect(userUpdateSpy).not.toHaveBeenCalled();
      });

      it('rejects candidate when stored currency mismatches gateway payment currency', async () => {
        const candidate = {
          _id: 'pay_mismatch_curr',
          userId: 'u_curr',
          razorpayOrderId: 'order_curr_4',
          amount: 99900,
          currency: 'USD', // stored as USD
          status: 'created',
          entitlementApplied: false,
          createdAt: new Date(Date.now() - 40 * 60 * 1000),
        };
        jest.spyOn(Payment, 'find').mockReturnValue({
          limit: jest.fn().mockResolvedValue([candidate]),
        });
        jest.spyOn(razorpayService, 'fetchOrder').mockResolvedValue({
          id: 'order_curr_4',
          status: 'paid',
          amount_paid: 99900,
        });
        jest.spyOn(razorpayService, 'fetchOrderPayments').mockResolvedValue({
          items: [
            { id: 'pay_gateway_inr', order_id: 'order_curr_4', status: 'captured', amount: 99900, currency: 'INR' },
          ],
        });
        const userUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate');
        const result = await reconcileOrphanedPayments();

        expect(result.checked).toBe(1);
        expect(result.reconciled).toBe(0);
        expect(userUpdateSpy).not.toHaveBeenCalled();
      });
    });
  });

  /* ─────────────────────────────────────────────────────────────
     7. Real-Time Expiry & Legacy Users (F13)
  ───────────────────────────────────────────────────────────── */
  describe('Real-Time Expiry & Legacy Compatibility (F13)', () => {
    it('immediately blocks expired user with HTTP 402 and downgrades to free', async () => {
      const next = jest.fn();
      const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000); // Expired yesterday

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'expired_user_1',
          subscription: {
            plan: 'pro',
            status: 'active',
            currentPeriodEnd: pastExpiry,
          },
          freeUsage: { debatesThisMonth: 5, resetMonth: new Date().toISOString().slice(0, 7) },
        }),
      });
      jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue(null);
      const downgradeSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({});

      const { req, res } = createMockReqRes({
        user: { id: 'expired_user_1' },
        enforceQuotaInTest: true,
      });

      await checkDebateQuota(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(402);
      expect(downgradeSpy).toHaveBeenCalledWith(
        'expired_user_1',
        expect.objectContaining({
          'subscription.status': 'expired',
          'subscription.plan': 'free',
        })
      );
    });

    it('blocks free user who reached monthly limit with 402 FREE_LIMIT_REACHED', async () => {
      const next = jest.fn();
      const currentMonth = new Date().toISOString().slice(0, 7);

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'free_capped_user',
          subscription: { plan: 'free', status: 'none', currentPeriodEnd: null },
          freeUsage: { debatesThisMonth: 5, resetMonth: currentMonth },
        }),
      });
      jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue(null);

      const { req, res } = createMockReqRes({
        user: { id: 'free_capped_user' },
        enforceQuotaInTest: true,
      });

      await checkDebateQuota(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(402);
      expect(res._data.code).toBe('FREE_LIMIT_REACHED');
      expect(res._data.limit).toBe(5);
    });

    it('allows active Pro user with unlimited debates without consuming free usage', async () => {
      const next = jest.fn();
      const futureExpiry = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'active_pro_user',
          subscription: {
            plan: 'pro',
            status: 'active',
            currentPeriodEnd: futureExpiry,
          },
          freeUsage: { debatesThisMonth: 0, resetMonth: new Date().toISOString().slice(0, 7) },
        }),
      });
      const findOneAndUpdateSpy = jest.spyOn(User, 'findOneAndUpdate');

      const { req, res } = createMockReqRes({
        user: { id: 'active_pro_user' },
        enforceQuotaInTest: true,
      });

      await checkDebateQuota(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(findOneAndUpdateSpy).not.toHaveBeenCalled();
    });

    it('returns isPaid: false, plan: free, status: expired in getSubscription', async () => {
      const pastExpiry = new Date(Date.now() - 5000);
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'expired_query_user',
          subscription: {
            plan: 'pro',
            status: 'active',
            currentPeriodEnd: pastExpiry,
          },
          freeUsage: { debatesThisMonth: 1, resetMonth: new Date().toISOString().slice(0, 7) },
        }),
      });

      const { req, res } = createMockReqRes({
        user: { id: 'expired_query_user' },
      });

      await getSubscription(req, res);
      expect(res.statusCode).toBe(200);
      expect(res._data.isPaid).toBe(false);
      expect(res._data.plan).toBe('free');
      expect(res._data.status).toBe('expired');
    });

    it('seamlessly updates legacy users whose subscription lacks appliedOrderIds', async () => {
      const legacyPayment = {
        _id: 'pay_legacy',
        userId: 'u_legacy',
        planId: 'pro',
        billingCycle: 'monthly',
        razorpayOrderId: 'ord_legacy',
        entitlementApplied: false,
        status: 'created',
      };

      jest.spyOn(Payment, 'findById').mockResolvedValue(legacyPayment);
      // Legacy user has no appliedOrderIds field
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_legacy',
        subscription: { plan: 'free', status: 'none', currentPeriodEnd: null },
      });

      let capturedUpdate = null;
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementation((id, update) => {
        capturedUpdate = update;
        return { _id: id, subscription: update.$set };
      });
      jest.spyOn(Payment, 'findByIdAndUpdate').mockResolvedValue({ ...legacyPayment, entitlementApplied: true });

      const result = await applyPaymentEntitlement({
        payment: legacyPayment,
        razorpayPaymentId: 'rzp_legacy',
      });

      expect(result.alreadyApplied).toBe(false);
      expect(capturedUpdate.$addToSet['subscription.appliedOrderIds']).toBe('ord_legacy');
    });
  });

  /* ─────────────────────────────────────────────────────────────
     8. Daily Pass Expiry Maintenance
  ───────────────────────────────────────────────────────────── */
  describe('expireStalePrepaidPasses Maintenance Job', () => {
    it('expires only passes whose expiry date has elapsed', async () => {
      let queryFilter = null;
      let updateDoc = null;
      jest.spyOn(User, 'updateMany').mockImplementation((filter, update) => {
        queryFilter = filter;
        updateDoc = update;
        return Promise.resolve({ modifiedCount: 3 });
      });

      const result = await expireStalePrepaidPasses();
      expect(result.modifiedCount).toBe(3);
      expect(queryFilter['subscription.status']).toBe('active');
      expect(queryFilter['subscription.currentPeriodEnd']).toHaveProperty('$lt');
      expect(updateDoc.$set['subscription.status']).toBe('expired');
      expect(updateDoc.$set['subscription.plan']).toBe('free');
    });

    it('preserves valid future passes', async () => {
      jest.spyOn(User, 'updateMany').mockImplementation((filter) => {
        expect(filter['subscription.currentPeriodEnd'].$lt.getTime()).toBeLessThanOrEqual(Date.now());
        return Promise.resolve({ modifiedCount: 0 });
      });

      const result = await expireStalePrepaidPasses();
      expect(result.modifiedCount).toBe(0);
    });
  });

  /* ─────────────────────────────────────────────────────────────
     9. Prepaid Cancellation & Reactivation Semantics
  ───────────────────────────────────────────────────────────── */
  describe('cancelSubscription Semantics', () => {
    it('informs user that prepaid access remains active without recurring charges', async () => {
      const futureEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'u_cancel',
        subscription: { plan: 'pro', status: 'active', currentPeriodEnd: futureEnd },
      });
      jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({});

      const { req, res } = createMockReqRes({ user: { id: 'u_cancel' } });
      await cancelSubscription(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._data.message).toContain('prepaid passes without automatic renewal');
      expect(res._data.message).toContain('no recurring charges will occur');
    });
  });
});
