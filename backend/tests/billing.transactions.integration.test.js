'use strict';

/**
 * @fileoverview Real MongoDB Replica-Set ACID Integration Tests for DebateForge Billing.
 *
 * Runs against an actual MongoMemoryReplSet instance WITHOUT mocking mongoose sessions or transactions.
 * Verifies:
 * 1. Successful transaction updates User and Payment atomically together.
 * 2. Failure during Payment finalization rolls back the User entitlement update.
 * 3. Failure during User update rolls back the Payment finalization.
 * 4. Duplicate webhook processing does not extend the subscription twice (durable idempotency).
 * 5. Two distinct concurrent renewals preserve both purchased durations.
 */

const { applyPaymentEntitlement, handleWebhook } = require('../controllers/billing.controller');
const { User, Payment } = require('../models');

describe('Billing Transactions ACID Real Integration Tests (MongoMemoryReplSet)', () => {
  const originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  beforeAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_integration_test_secret';
  });

  afterAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /* ─────────────────────────────────────────────────────────────
     1. Successful Transaction Atomicity
  ───────────────────────────────────────────────────────────── */
  it('1. Successful transaction commits User entitlement and Payment finalization together in real replica set', async () => {
    const user = await User.create({
      username: 'real_tx_user_1',
      email: 'real1@example.com',
      passwordHash: 'hashed_pw_test_1',
      subscription: {
        plan: 'free',
        status: 'none',
        currentPeriodEnd: null,
        appliedOrderIds: [],
      },
    });

    const payment = await Payment.create({
      userId: user._id,
      razorpayOrderId: 'order_real_tx_001',
      planId: 'pro',
      billingCycle: 'monthly',
      amount: 99900,
      currency: 'INR',
      status: 'created',
      entitlementApplied: false,
    });

    const beforeTime = Date.now();
    const result = await applyPaymentEntitlement({
      payment,
      razorpayPaymentId: 'pay_real_001',
      razorpaySignature: 'sig_real_001',
      paymentMethod: 'card',
    });
    const afterTime = Date.now();

    expect(result.success).toBe(true);
    expect(result.alreadyApplied).toBe(false);

    // Verify directly in MongoDB without active session
    const updatedUser = await User.findById(user._id);
    const updatedPayment = await Payment.findById(payment._id);

    expect(updatedPayment.status).toBe('captured');
    expect(updatedPayment.entitlementApplied).toBe(true);
    expect(updatedPayment.razorpayPaymentId).toBe('pay_real_001');

    expect(updatedUser.subscription.plan).toBe('pro');
    expect(updatedUser.subscription.status).toBe('active');
    expect(updatedUser.subscription.billingCycle).toBe('monthly');
    expect(updatedUser.subscription.appliedOrderIds).toContain('order_real_tx_001');

    const expectedExpiry = beforeTime + 30 * 24 * 60 * 60 * 1000;
    const actualExpiry = new Date(updatedUser.subscription.currentPeriodEnd).getTime();
    expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry - 2000);
    expect(actualExpiry).toBeLessThanOrEqual(afterTime + 30 * 24 * 60 * 60 * 1000);
  });

  /* ─────────────────────────────────────────────────────────────
     2. Failure during Payment Finalization Rolls Back User Update
  ───────────────────────────────────────────────────────────── */
  it('2. Failure during Payment finalization rolls back User entitlement update', async () => {
    const user = await User.create({
      username: 'real_tx_rollback_user_2',
      email: 'real2@example.com',
      passwordHash: 'hashed_pw_test_2',
      subscription: {
        plan: 'free',
        status: 'none',
        currentPeriodEnd: null,
        appliedOrderIds: [],
      },
    });

    const payment = await Payment.create({
      userId: user._id,
      razorpayOrderId: 'order_real_tx_002',
      planId: 'pro',
      billingCycle: 'monthly',
      amount: 99900,
      currency: 'INR',
      status: 'created',
      entitlementApplied: false,
    });

    // Induce a failure on Payment update inside the transaction (after User has been updated)
    const originalFindByIdAndUpdate = Payment.findByIdAndUpdate;
    jest.spyOn(Payment, 'findByIdAndUpdate').mockImplementation((...args) => {
      // If called with a session (inside transaction), throw a database error
      if (args[2]?.session) {
        throw new Error('Simulated database crash during Payment finalization');
      }
      return originalFindByIdAndUpdate.apply(Payment, args);
    });

    await expect(
      applyPaymentEntitlement({
        payment,
        razorpayPaymentId: 'pay_real_002',
        razorpaySignature: 'sig_real_002',
      })
    ).rejects.toThrow('Simulated database crash during Payment finalization');

    // Verify rollback directly from MongoDB: User must NOT have been updated!
    const persistedUser = await User.findById(user._id);
    const persistedPayment = await Payment.findById(payment._id);

    expect(persistedUser.subscription.plan).toBe('free');
    expect(persistedUser.subscription.status).toBe('none');
    expect(persistedUser.subscription.currentPeriodEnd).toBeNull();
    expect(persistedUser.subscription.appliedOrderIds).toEqual([]);

    expect(persistedPayment.status).toBe('created');
    expect(persistedPayment.entitlementApplied).toBe(false);
  });

  /* ─────────────────────────────────────────────────────────────
     3. Failure during User Update Rolls Back Payment Update
  ───────────────────────────────────────────────────────────── */
  it('3. Failure during User update rolls back Payment finalization', async () => {
    const user = await User.create({
      username: 'real_tx_rollback_user_3',
      email: 'real3@example.com',
      passwordHash: 'hashed_pw_test_3',
      subscription: {
        plan: 'free',
        status: 'none',
        currentPeriodEnd: null,
        appliedOrderIds: [],
      },
    });

    const payment = await Payment.create({
      userId: user._id,
      razorpayOrderId: 'order_real_tx_003',
      planId: 'institution',
      billingCycle: 'monthly',
      amount: 2499900,
      currency: 'INR',
      status: 'created',
      entitlementApplied: false,
    });

    // Induce a failure on User update inside the transaction
    const originalUserUpdate = User.findByIdAndUpdate;
    jest.spyOn(User, 'findByIdAndUpdate').mockImplementation((...args) => {
      if (args[2]?.session) {
        throw new Error('Simulated write conflict / timeout on User document');
      }
      return originalUserUpdate.apply(User, args);
    });

    await expect(
      applyPaymentEntitlement({
        payment,
        razorpayPaymentId: 'pay_real_003',
        razorpaySignature: 'sig_real_003',
      })
    ).rejects.toThrow('Simulated write conflict / timeout on User document');

    // Verify both remain in initial uncommitted state
    const persistedUser = await User.findById(user._id);
    const persistedPayment = await Payment.findById(payment._id);

    expect(persistedUser.subscription.plan).toBe('free');
    expect(persistedUser.subscription.status).toBe('none');
    expect(persistedPayment.status).toBe('created');
    expect(persistedPayment.entitlementApplied).toBe(false);
  });

  /* ─────────────────────────────────────────────────────────────
     4. Duplicate Webhook Processing Does Not Extend Subscription Twice
  ───────────────────────────────────────────────────────────── */
  it('4. Duplicate webhook processing does not extend the subscription twice (durable idempotency)', async () => {
    const user = await User.create({
      username: 'real_dup_user_4',
      email: 'real4@example.com',
      passwordHash: 'hashed_pw_test_4',
      subscription: {
        plan: 'free',
        status: 'none',
        currentPeriodEnd: null,
        appliedOrderIds: [],
      },
    });

    await Payment.create({
      userId: user._id,
      razorpayOrderId: 'order_real_dup_004',
      planId: 'pro',
      billingCycle: 'monthly',
      amount: 99900,
      currency: 'INR',
      status: 'created',
      entitlementApplied: false,
    });

    // Helper to invoke webhook with valid HMAC
    const crypto = require('crypto');
    function invokeWebhook(payload) {
      const bodyStr = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(bodyStr)
        .digest('hex');

      const req = {
        headers: { 'x-razorpay-signature': signature },
        body: Buffer.from(bodyStr),
      };

      const res = {
        statusCode: 200,
        _data: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this._data = data;
          return this;
        },
      };

      return { req, res };
    }

    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_real_dup_004',
            order_id: 'order_real_dup_004',
            amount: 99900,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
          },
        },
      },
    };

    // First webhook delivery
    const call1 = invokeWebhook(webhookPayload);
    await handleWebhook(call1.req, call1.res);
    expect(call1.res.statusCode).toBe(200);

    const userAfterFirst = await User.findById(user._id);
    const firstExpiry = new Date(userAfterFirst.subscription.currentPeriodEnd).getTime();
    expect(userAfterFirst.subscription.plan).toBe('pro');
    expect(userAfterFirst.subscription.appliedOrderIds).toEqual(['order_real_dup_004']);

    // Second (duplicate) webhook delivery
    const call2 = invokeWebhook(webhookPayload);
    await handleWebhook(call2.req, call2.res);
    expect(call2.res.statusCode).toBe(200);

    const userAfterSecond = await User.findById(user._id);
    const secondExpiry = new Date(userAfterSecond.subscription.currentPeriodEnd).getTime();

    // Expiry must be identical — exactly 30 days, NOT 60 days
    expect(secondExpiry).toBe(firstExpiry);
    expect(userAfterSecond.subscription.appliedOrderIds).toEqual(['order_real_dup_004']);
  });

  /* ─────────────────────────────────────────────────────────────
     5. Two Distinct Concurrent Renewals Preserve Both Purchased Durations
  ───────────────────────────────────────────────────────────── */
  it('5. Two distinct renewals preserve both purchased durations (concurrency & stacking)', async () => {
    const now = Date.now();
    const initialExpiry = new Date(now + 10 * 24 * 60 * 60 * 1000); // 10 days left

    const user = await User.create({
      username: 'real_stacking_user_5',
      email: 'real5@example.com',
      passwordHash: 'hashed_pw_test_5',
      subscription: {
        plan: 'pro',
        status: 'active',
        currentPeriodEnd: initialExpiry,
        appliedOrderIds: [],
      },
    });

    const paymentA = await Payment.create({
      userId: user._id,
      razorpayOrderId: 'order_real_stack_A',
      planId: 'pro',
      billingCycle: 'monthly',
      amount: 99900,
      currency: 'INR',
      status: 'created',
      entitlementApplied: false,
    });

    const paymentB = await Payment.create({
      userId: user._id,
      razorpayOrderId: 'order_real_stack_B',
      planId: 'pro',
      billingCycle: 'monthly',
      amount: 99900,
      currency: 'INR',
      status: 'created',
      entitlementApplied: false,
    });

    // Execute Payment A and Payment B
    const resA = await applyPaymentEntitlement({
      payment: paymentA,
      razorpayPaymentId: 'pay_real_stack_A',
      paymentMethod: 'card',
    });

    const resB = await applyPaymentEntitlement({
      payment: paymentB,
      razorpayPaymentId: 'pay_real_stack_B',
      paymentMethod: 'upi',
    });

    expect(resA.success).toBe(true);
    expect(resB.success).toBe(true);

    const finalUser = await User.findById(user._id);
    const finalPaymentA = await Payment.findById(paymentA._id);
    const finalPaymentB = await Payment.findById(paymentB._id);

    expect(finalPaymentA.entitlementApplied).toBe(true);
    expect(finalPaymentB.entitlementApplied).toBe(true);

    expect(finalUser.subscription.appliedOrderIds).toContain('order_real_stack_A');
    expect(finalUser.subscription.appliedOrderIds).toContain('order_real_stack_B');

    // Expected final expiry: initial 10 days + 30 days (A) + 30 days (B) = +70 days from now
    const expectedTotalExpiry = initialExpiry.getTime() + 60 * 24 * 60 * 60 * 1000;
    const actualFinalExpiry = new Date(finalUser.subscription.currentPeriodEnd).getTime();
    expect(actualFinalExpiry).toBe(expectedTotalExpiry);
  });

  /* ─────────────────────────────────────────────────────────────
     6. Genuinely Concurrent Renewals with Promise.all()
  ───────────────────────────────────────────────────────────── */
  it('6. Genuinely concurrent renewals via Promise.all() against real replica set preserve both durations without loss', async () => {
    const now = Date.now();
    const initialExpiry = new Date(now + 15 * 24 * 60 * 60 * 1000); // 15 days remaining

    const user = await User.create({
      username: 'real_concurrent_user_6',
      email: 'real6@example.com',
      passwordHash: 'hashed_pw_test_6',
      subscription: {
        plan: 'pro',
        status: 'active',
        currentPeriodEnd: initialExpiry,
        appliedOrderIds: [],
      },
    });

    const payment1 = await Payment.create({
      userId: user._id,
      razorpayOrderId: 'order_concurrent_1',
      planId: 'pro',
      billingCycle: 'monthly',
      amount: 99900,
      currency: 'INR',
      status: 'created',
      entitlementApplied: false,
    });

    const payment2 = await Payment.create({
      userId: user._id,
      razorpayOrderId: 'order_concurrent_2',
      planId: 'pro',
      billingCycle: 'monthly',
      amount: 99900,
      currency: 'INR',
      status: 'created',
      entitlementApplied: false,
    });

    // Execute genuinely concurrently via Promise.all()
    const [res1, res2] = await Promise.all([
      applyPaymentEntitlement({
        payment: payment1,
        razorpayPaymentId: 'pay_concurrent_1',
        paymentMethod: 'card',
      }),
      applyPaymentEntitlement({
        payment: payment2,
        razorpayPaymentId: 'pay_concurrent_2',
        paymentMethod: 'upi',
      }),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.alreadyApplied).toBe(false);
    expect(res2.alreadyApplied).toBe(false);

    // Verify persisted state in MongoDB replica set
    const finalUser = await User.findById(user._id);
    const finalPayment1 = await Payment.findById(payment1._id);
    const finalPayment2 = await Payment.findById(payment2._id);

    // Both payments must be finalized
    expect(finalPayment1.status).toBe('captured');
    expect(finalPayment1.entitlementApplied).toBe(true);
    expect(finalPayment1.razorpayPaymentId).toBe('pay_concurrent_1');

    expect(finalPayment2.status).toBe('captured');
    expect(finalPayment2.entitlementApplied).toBe(true);
    expect(finalPayment2.razorpayPaymentId).toBe('pay_concurrent_2');

    // Both order IDs must be present in appliedOrderIds
    expect(finalUser.subscription.appliedOrderIds).toContain('order_concurrent_1');
    expect(finalUser.subscription.appliedOrderIds).toContain('order_concurrent_2');
    expect(finalUser.subscription.appliedOrderIds.length).toBe(2);

    // Both durations are preserved without loss: 15 days + 30 days + 30 days = +75 days
    const expectedFinalExpiry = initialExpiry.getTime() + 60 * 24 * 60 * 60 * 1000;
    const actualFinalExpiry = new Date(finalUser.subscription.currentPeriodEnd).getTime();
    expect(actualFinalExpiry).toBe(expectedFinalExpiry);
  });
});
