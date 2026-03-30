/**
 * Queue job handler tests
 *
 * Tests each processor function directly (no BullMQ/Redis required).
 * Covers: success output contracts, validation failures, retry-triggering
 * throws, structured logging, and dead-letter semantics.
 */

// ── mocks ─────────────────────────────────────────────────────────────────────
jest.mock('../queues/queueManager', () => ({
  queueManager: {
    createWorker: jest.fn(),
    createQueue: jest.fn(() => ({ name: 'mock-queue' })),
    addJob: jest.fn(),
    addBulkJobs: jest.fn(),
    getQueueStats: jest.fn(),
    getFailedJobs: jest.fn(),
    retryJob: jest.fn(),
    removeJob: jest.fn(),
  },
}));

jest.mock('../services/CohortService', () => ({
  cohortService: {
    invalidateCache: jest.fn(),
    computeCohorts: jest.fn(),
  },
}));

// ── imports ───────────────────────────────────────────────────────────────────
import {
  processEmailJob,
  processPayoutJob,
  processSyncAccountJob,
  processSyncTransactionsJob,
  processSyncBalancesJob,
  processFullSyncJob,
  processSyncContractJob,
  processDeployContractJob,
  processNotificationJob,
} from '../jobs/workers';
import { processEmailJob as processEmailJobTyped, processBulkEmailJob } from '../jobs/emailJob';
import { processPayoutJob as processPayoutJobTyped, processBatchPayoutJob } from '../jobs/payoutJob';
import { processCohortJob } from '../jobs/cohortJob';
import { cohortService } from '../services/CohortService';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal mock Job */
function makeJob(id: string, data: Record<string, unknown>, name = 'job'): any {
  return {
    id,
    name,
    data,
    updateProgress: jest.fn().mockResolvedValue(undefined),
    attemptsMade: 0,
  };
}

// Suppress console output from processors
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
// Email job
// ═══════════════════════════════════════════════════════════════════════════════

describe('processEmailJob (workers.ts)', () => {
  it('returns success output contract', async () => {
    const job = makeJob('e1', { to: 'user@example.com', subject: 'Hi', body: 'Hello', metadata: { userId: 'u1' } });
    const result = await processEmailJob(job);
    expect(result).toMatchObject({
      success: true,
      emailId: 'e1',
      recipient: 'user@example.com',
      metadata: { userId: 'u1' },
    });
    expect(typeof result.sentAt).toBe('string');
  });
});

describe('processEmailJob (emailJob.ts — typed)', () => {
  it('returns success output contract with subject', async () => {
    const job = makeJob('e2', { to: 'a@b.com', subject: 'Test', body: 'Body' });
    const result = await processEmailJobTyped(job);
    expect(result).toMatchObject({ success: true, recipient: 'a@b.com', subject: 'Test' });
  });

  it('calls updateProgress during processing', async () => {
    const job = makeJob('e3', { to: 'a@b.com', subject: 'S', body: 'B' });
    await processEmailJobTyped(job);
    expect(job.updateProgress).toHaveBeenCalled();
  });

  it('throws (triggering retry) when required fields are missing', async () => {
    const job = makeJob('e4', { to: 'a@b.com' }); // missing subject + body
    await expect(processEmailJobTyped(job)).rejects.toThrow('Failed to send email');
  });

  it('thrown error message is structured for dead-letter inspection', async () => {
    const job = makeJob('e5', { to: '' }); // missing all
    await expect(processEmailJobTyped(job)).rejects.toThrow(/Failed to send email/);
  });
});

describe('processBulkEmailJob', () => {
  it('returns aggregate counts', async () => {
    const emails = [
      { to: 'a@b.com', subject: 'S', body: 'B' },
      { to: 'c@d.com', subject: 'S2', body: 'B2' },
    ];
    const job = makeJob('be1', { emails });
    const result = await processBulkEmailJob(job);
    expect(result).toMatchObject({ success: true, total: 2, successful: 2, failed: 0 });
    expect(result.results).toHaveLength(2);
  });

  it('calls updateProgress for each email', async () => {
    const job = makeJob('be2', { emails: [{ to: 'x@y.com', subject: 'S', body: 'B' }] });
    await processBulkEmailJob(job);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Payout job
// ═══════════════════════════════════════════════════════════════════════════════

const validPayout = {
  groupId: 'g1',
  amount: 100,
  recipient: 'wallet-addr',
  recipientType: 'wallet',
  currency: 'USD',
  metadata: { userId: 'u1' },
};

describe('processPayoutJob (workers.ts)', () => {
  it('returns success output contract', async () => {
    const job = makeJob('p1', validPayout);
    const result = await processPayoutJob(job);
    expect(result).toMatchObject({
      success: true,
      transactionId: 'p1',
      groupId: 'g1',
      amount: 100,
      currency: 'USD',
      status: 'completed',
    });
    expect(typeof result.processedAt).toBe('string');
  });
});

describe('processPayoutJob (payoutJob.ts — typed)', () => {
  it('returns success output contract', async () => {
    const job = makeJob('p2', validPayout);
    const result = await processPayoutJobTyped(job);
    expect(result).toMatchObject({ success: true, amount: 100, currency: 'USD', status: 'completed' });
  });

  it('calls updateProgress during processing', async () => {
    const job = makeJob('p3', validPayout);
    await processPayoutJobTyped(job);
    expect(job.updateProgress).toHaveBeenCalled();
  });

  it('throws (triggering retry) when amount is zero', async () => {
    const job = makeJob('p4', { ...validPayout, amount: 0 });
    await expect(processPayoutJobTyped(job)).rejects.toThrow('Failed to process payout');
  });

  it('throws (triggering retry) when required fields are missing', async () => {
    const job = makeJob('p5', { groupId: 'g1' }); // missing amount, recipient, currency
    await expect(processPayoutJobTyped(job)).rejects.toThrow('Failed to process payout');
  });

  it('thrown error is structured for dead-letter inspection', async () => {
    const job = makeJob('p6', { ...validPayout, amount: -1 });
    await expect(processPayoutJobTyped(job)).rejects.toThrow(/Failed to process payout/);
  });
});

describe('processBatchPayoutJob', () => {
  it('returns aggregate counts for valid payouts', async () => {
    const payouts = [validPayout, { ...validPayout, recipient: 'wallet-2' }];
    const job = makeJob('bp1', { payouts });
    const result = await processBatchPayoutJob(job);
    expect(result).toMatchObject({ success: true, totalPayouts: 2, successfulPayouts: 2, failedPayouts: 0 });
  });

  it('counts failed payouts when a payout is invalid', async () => {
    const payouts = [validPayout, { recipient: 'x' }]; // second is missing required fields
    const job = makeJob('bp2', { payouts });
    const result = await processBatchPayoutJob(job);
    expect(result.failedPayouts).toBe(1);
    expect(result.successfulPayouts).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sync jobs
// ═══════════════════════════════════════════════════════════════════════════════

describe('sync job processors', () => {
  it('processSyncAccountJob returns success with accountId', async () => {
    const job = makeJob('s1', { accountId: 'acc-1', metadata: {} });
    const result = await processSyncAccountJob(job);
    expect(result).toMatchObject({ success: true, accountId: 'acc-1' });
    expect(typeof result.syncedAt).toBe('string');
  });

  it('processSyncTransactionsJob returns block range in output', async () => {
    const job = makeJob('s2', { accountId: 'acc-1', startBlock: 100, endBlock: 200 });
    const result = await processSyncTransactionsJob(job);
    expect(result).toMatchObject({ success: true, startBlock: 100, endBlock: 200 });
  });

  it('processSyncBalancesJob returns success', async () => {
    const job = makeJob('s3', { accountId: 'acc-1' });
    const result = await processSyncBalancesJob(job);
    expect(result).toMatchObject({ success: true, accountId: 'acc-1' });
  });

  it('processFullSyncJob returns success', async () => {
    const job = makeJob('s4', { accountId: 'acc-1' });
    const result = await processFullSyncJob(job);
    expect(result).toMatchObject({ success: true, accountId: 'acc-1' });
  });

  it('processSyncContractJob returns action and contractType', async () => {
    const job = makeJob('s5', { contractId: 'c1', contractType: 'ERC20', action: 'sync' });
    const result = await processSyncContractJob(job);
    expect(result).toMatchObject({ success: true, contractId: 'c1', contractType: 'ERC20', action: 'sync' });
  });

  it('processDeployContractJob returns deployedAt', async () => {
    const job = makeJob('s6', { contractId: 'c2', contractType: 'ERC721' });
    const result = await processDeployContractJob(job);
    expect(result).toMatchObject({ success: true, contractId: 'c2' });
    expect(typeof result.deployedAt).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Notification job
// ═══════════════════════════════════════════════════════════════════════════════

describe('processNotificationJob', () => {
  const types = ['push', 'sms', 'in_app', 'webhook', 'slack', 'discord'] as const;

  it.each(types)('returns success for type=%s', async (type) => {
    const job = makeJob('n1', { type, recipient: 'user-1', title: 'T', message: 'M' });
    const result = await processNotificationJob(job);
    expect(result).toMatchObject({ success: true, type, recipient: 'user-1' });
    expect(typeof result.sentAt).toBe('string');
  });

  it('returns success for unknown type (no throw — logged as warn)', async () => {
    const job = makeJob('n2', { type: 'unknown', recipient: 'user-1' });
    const result = await processNotificationJob(job);
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cohort job
// ═══════════════════════════════════════════════════════════════════════════════

describe('processCohortJob', () => {
  const mockResult = {
    totalUsers: 50,
    segments: [{ cohort: 'power', count: 10 }, { cohort: 'casual', count: 40 }],
    computedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    (cohortService.computeCohorts as jest.Mock).mockResolvedValue(mockResult);
  });

  it('returns structured summary with segment breakdown', async () => {
    const job = makeJob('co1', { organizationId: 'org-1', triggeredBy: 'daily' });
    const result = await processCohortJob(job) as any;
    expect(result).toMatchObject({
      jobId: 'co1',
      triggeredBy: 'daily',
      organizationId: 'org-1',
      totalUsers: 50,
    });
    expect(result.segments).toHaveLength(2);
    expect(result.computedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('invalidates cache before computing', async () => {
    const job = makeJob('co2', { organizationId: 'org-2' });
    await processCohortJob(job);
    expect(cohortService.invalidateCache).toHaveBeenCalledWith('org-2');
    // invalidateCache must be called before computeCohorts
    const invalidateOrder = (cohortService.invalidateCache as jest.Mock).mock.invocationCallOrder[0];
    const computeOrder = (cohortService.computeCohorts as jest.Mock).mock.invocationCallOrder[0];
    expect(invalidateOrder).toBeLessThan(computeOrder);
  });

  it('uses "global" as organizationId label when omitted', async () => {
    const job = makeJob('co3', { triggeredBy: 'manual' });
    const result = await processCohortJob(job) as any;
    expect(result.organizationId).toBe('global');
  });

  it('propagates error from computeCohorts (triggering retry)', async () => {
    (cohortService.computeCohorts as jest.Mock).mockRejectedValueOnce(new Error('DB timeout'));
    const job = makeJob('co4', { organizationId: 'org-3' });
    await expect(processCohortJob(job)).rejects.toThrow('DB timeout');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Retry / dead-letter semantics
// ═══════════════════════════════════════════════════════════════════════════════

describe('retry and dead-letter semantics', () => {
  it('email processor throws Error (not string) so BullMQ can serialize it', async () => {
    const job = makeJob('r1', { to: '' });
    try {
      await processEmailJobTyped(job);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('payout processor throws Error (not string) so BullMQ can serialize it', async () => {
    const job = makeJob('r2', { groupId: 'g', amount: 0, recipient: 'r', recipientType: 'bank', currency: 'USD' });
    try {
      await processPayoutJobTyped(job);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('cohort processor re-throws original error for BullMQ retry counting', async () => {
    (cohortService.computeCohorts as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
    const job = makeJob('r3', {});
    await expect(processCohortJob(job)).rejects.toThrow('timeout');
  });
});
