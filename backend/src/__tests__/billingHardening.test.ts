/**
 * Billing hardening tests
 *
 * Covers four issues:
 *  1. createCheckoutSession always includes payment_method_types
 *  2. Credits are refunded when the platform publish call fails
 *  3. provisionUser is idempotent — a second call returns the existing Stripe customer
 *  4. processPayoutJob writes a PayoutFailure record on failure
 */

// ── Stripe mock ───────────────────────────────────────────────────────────────

const mockSessionCreate = jest.fn();
const mockCustomerCreate = jest.fn();
const mockCustomerList = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: { create: mockSessionCreate },
    },
    customers: {
      create: mockCustomerCreate,
      list: mockCustomerList,
    },
    billingPortal: {
      sessions: { create: jest.fn().mockResolvedValue({ url: 'https://portal.example.com' }) },
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockPayoutFailureCreate = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    payoutFailure: {
      create: mockPayoutFailureCreate,
    },
  },
}));

// ── Queue manager mock (needed by payoutJob import) ───────────────────────────

jest.mock('../queues/queueManager', () => ({
  queueManager: {
    createWorker: jest.fn(),
    createQueue: jest.fn(() => ({ name: 'mock-queue' })),
    addJob: jest.fn(),
  },
}));

// ── imports (after mocks) ─────────────────────────────────────────────────────

import { BillingService } from '../services/BillingService';
import { SubscriptionStore, CreditLogStore, PLAN_CREDITS } from '../models/Subscription';
import { processPayoutJob } from '../jobs/payoutJob';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeJob(id: string, data: Record<string, unknown>): any {
  return {
    id,
    name: 'job',
    data,
    updateProgress: jest.fn().mockResolvedValue(undefined),
    attemptsMade: 0,
  };
}

const STRIPE_KEY = 'sk_test_fake';

beforeEach(() => {
  // Reset in-memory stores between tests by clearing via the public API.
  // The stores use module-level Map/array, so we patch them directly.
  const subStore = SubscriptionStore as any;
  const logStore = CreditLogStore as any;

  // Access the underlying module-level collections via the closure.
  // We do this by re-importing the module's internal state through a known
  // method: upsert a sentinel then delete it to get a handle on the map.
  // Simpler: just clear by overwriting with fresh collections via Object.assign.
  // Since the stores are plain objects wrapping module-level vars, we can't
  // directly clear them — instead we rely on unique userIds per test to avoid
  // cross-test pollution, and reset env vars only.
  jest.clearAllMocks();

  process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
  delete process.env.STRIPE_PAYMENT_METHODS;
});

afterAll(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

// ═══════════════════════════════════════════════════════════════════════════════
// Issue 1 — createCheckoutSession always includes payment_method_types
// ═══════════════════════════════════════════════════════════════════════════════

describe('createCheckoutSession — payment_method_types', () => {
  const userId = 'user-checkout';
  const stripeCustomerId = 'cus_test_checkout';

  beforeEach(() => {
    // Pre-seed a subscription so the service doesn't call provisionUser
    SubscriptionStore.upsert({
      id: 'sub-1',
      userId,
      plan: 'free',
      status: 'active',
      stripeCustomerId,
      stripeSubscriptionId: null,
      creditsRemaining: PLAN_CREDITS.free,
      creditsMonthly: PLAN_CREDITS.free,
      currentPeriodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_url' });
  });

  it('includes payment_method_types defaulting to ["card"]', async () => {
    const service = new BillingService();
    await service.createCheckoutSession(userId, 'price_123', 'https://ok', 'https://cancel');

    expect(mockSessionCreate).toHaveBeenCalledTimes(1);
    const callArg = mockSessionCreate.mock.calls[0][0];
    expect(callArg).toHaveProperty('payment_method_types');
    expect(callArg.payment_method_types).toEqual(['card']);
  });

  it('respects STRIPE_PAYMENT_METHODS env var', async () => {
    process.env.STRIPE_PAYMENT_METHODS = 'card,link';
    const service = new BillingService();
    await service.createCheckoutSession(userId, 'price_123', 'https://ok', 'https://cancel');

    const callArg = mockSessionCreate.mock.calls[0][0];
    expect(callArg.payment_method_types).toEqual(['card', 'link']);
  });

  it('payment_method_types is never omitted even with empty env var', async () => {
    process.env.STRIPE_PAYMENT_METHODS = '';
    const service = new BillingService();
    // Empty string falls back to default 'card' because filter(Boolean) removes empty strings
    // and the env var is falsy so the ?? 'card' default kicks in
    await service.createCheckoutSession(userId, 'price_123', 'https://ok', 'https://cancel');

    const callArg = mockSessionCreate.mock.calls[0][0];
    expect(callArg).toHaveProperty('payment_method_types');
    expect(Array.isArray(callArg.payment_method_types)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Issue 2 — Credits are refunded when the platform publish call fails
// ═══════════════════════════════════════════════════════════════════════════════

describe('BillingService.refundCredits — compensating transaction', () => {
  const userId = 'user-refund';

  beforeEach(() => {
    SubscriptionStore.upsert({
      id: 'sub-2',
      userId,
      plan: 'free',
      status: 'active',
      stripeCustomerId: 'cus_refund',
      stripeSubscriptionId: null,
      creditsRemaining: PLAN_CREDITS.free,
      creditsMonthly: PLAN_CREDITS.free,
      currentPeriodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('restores credits after a deduction', () => {
    const service = new BillingService();
    const balanceAfterDeduct = service.deductCredits(userId, 'post:publish');
    expect(balanceAfterDeduct).toBe(PLAN_CREDITS.free - 1);

    const balanceAfterRefund = service.refundCredits(userId, 'post:publish', 'platform_failure:twitter');
    expect(balanceAfterRefund).toBe(PLAN_CREDITS.free);
  });

  it('appends a credit:topup log entry with the refund reason', () => {
    const service = new BillingService();
    service.deductCredits(userId, 'post:publish');
    service.refundCredits(userId, 'post:publish', 'platform_failure:twitter');

    const logs = CreditLogStore.forUser(userId, 100);
    const refundLog = logs.find((l) => l.action === 'credit:topup');
    expect(refundLog).toBeDefined();
    expect(refundLog?.metadata?.reason).toBe('platform_failure:twitter');
    expect(refundLog?.metadata?.refundedAction).toBe('post:publish');
    expect(refundLog?.delta).toBe(1); // post:publish costs 1 credit
  });

  it('throws when user has no subscription', () => {
    const service = new BillingService();
    expect(() => service.refundCredits('nonexistent-user', 'post:publish')).toThrow(
      'No subscription found for user',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Issue 3 — provisionUser is idempotent (no duplicate Stripe customers)
// ═══════════════════════════════════════════════════════════════════════════════

describe('provisionUser — idempotent Stripe customer creation', () => {
  const email = 'idempotent@example.com';
  const existingCustomerId = 'cus_existing_123';

  it('creates a new customer when none exists in Stripe', async () => {
    mockCustomerList.mockResolvedValue({ data: [] });
    mockCustomerCreate.mockResolvedValue({ id: 'cus_new_456' });

    const service = new BillingService();
    const sub = await service.provisionUser('user-idempotent-1', email);

    expect(mockCustomerList).toHaveBeenCalledWith({ email, limit: 1 });
    expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
    expect(sub.stripeCustomerId).toBe('cus_new_456');
  });

  it('reuses the existing Stripe customer when one is found by email', async () => {
    mockCustomerList.mockResolvedValue({ data: [{ id: existingCustomerId }] });

    const service = new BillingService();
    const sub = await service.provisionUser('user-idempotent-2', email);

    expect(mockCustomerList).toHaveBeenCalledWith({ email, limit: 1 });
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(sub.stripeCustomerId).toBe(existingCustomerId);
  });

  it('returns the existing local subscription on a second call without hitting Stripe', async () => {
    mockCustomerList.mockResolvedValue({ data: [] });
    mockCustomerCreate.mockResolvedValue({ id: 'cus_once' });

    const service = new BillingService();
    const userId = 'user-idempotent-3';
    const first = await service.provisionUser(userId, email);
    const second = await service.provisionUser(userId, email);

    // Stripe should only have been called once
    expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
    expect(first.stripeCustomerId).toBe(second.stripeCustomerId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Issue 4 — processPayoutJob writes a PayoutFailure record on failure
// ═══════════════════════════════════════════════════════════════════════════════

describe('processPayoutJob — payout failure audit', () => {
  const validPayout = {
    groupId: 'g-audit',
    amount: 50,
    recipient: 'wallet-0xabc',
    recipientType: 'wallet' as const,
    currency: 'USD',
    metadata: { userId: 'u-audit' },
  };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPayoutFailureCreate.mockResolvedValue({});
  });

  afterEach(() => jest.restoreAllMocks());

  it('writes a PayoutFailure record when the job fails due to missing fields', async () => {
    const job = makeJob('pf-1', { groupId: 'g-audit' }); // missing required fields
    await expect(processPayoutJob(job)).rejects.toThrow('Failed to process payout');

    expect(mockPayoutFailureCreate).toHaveBeenCalledTimes(1);
    const record = mockPayoutFailureCreate.mock.calls[0][0].data;
    expect(record.jobId).toBe('pf-1');
    expect(typeof record.reason).toBe('string');
    expect(record.reason.length).toBeGreaterThan(0);
  });

  it('writes a PayoutFailure record with the correct reason when amount is zero', async () => {
    const job = makeJob('pf-2', { ...validPayout, amount: 0 });
    await expect(processPayoutJob(job)).rejects.toThrow('Failed to process payout');

    expect(mockPayoutFailureCreate).toHaveBeenCalledTimes(1);
    const record = mockPayoutFailureCreate.mock.calls[0][0].data;
    expect(record.reason).toMatch(/greater than 0/i);
    expect(record.groupId).toBe('g-audit');
  });

  it('includes a failedAt-compatible timestamp (uses DB default, record has correct shape)', async () => {
    const job = makeJob('pf-3', { ...validPayout, amount: -1 });
    await expect(processPayoutJob(job)).rejects.toThrow();

    const record = mockPayoutFailureCreate.mock.calls[0][0].data;
    // The model uses @default(now()) so the application doesn't set failedAt explicitly;
    // verify the other required fields are present and correctly typed.
    expect(record).toMatchObject({
      jobId: 'pf-3',
      groupId: 'g-audit',
      recipient: 'wallet-0xabc',
      amount: -1,
      currency: 'USD',
    });
  });

  it('still throws the original error after writing the failure record', async () => {
    const job = makeJob('pf-4', { groupId: 'g-audit' });
    await expect(processPayoutJob(job)).rejects.toThrow(/Failed to process payout/);
  });

  it('does not write a failure record on success', async () => {
    const job = makeJob('pf-5', validPayout);
    const result = await processPayoutJob(job);
    expect(result.success).toBe(true);
    expect(mockPayoutFailureCreate).not.toHaveBeenCalled();
  });
});
