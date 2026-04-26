/**
 * processBatchPayoutJob – partial failure re-enqueue tests
 *
 * Verifies that failed payout items are re-enqueued individually and the
 * batch job is marked as failed when any item fails.
 */

jest.mock('../queues/queueManager', () => ({
  queueManager: {
    createQueue: jest.fn(() => ({ name: 'payout' })),
    createWorker: jest.fn(),
    addJob: jest.fn().mockResolvedValue('job-id'),
    addBulkJobs: jest.fn().mockResolvedValue(['re-job-1']),
  },
}));

jest.mock('../lib/prisma', () => ({
  prisma: { payoutFailure: { create: jest.fn().mockResolvedValue({}) } },
}));

import { Job } from 'bullmq';
import { queueManager } from '../queues/queueManager';
import { processBatchPayoutJob } from '../jobs/payoutJob';
import { PayoutJobData } from '../queues/payoutQueue';

const addBulkJobs = queueManager.addBulkJobs as jest.Mock;

function makeJob(payouts: PayoutJobData[]): Job<{ payouts: PayoutJobData[] }> {
  return {
    id: 'batch-1',
    data: { payouts },
    updateProgress: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<{ payouts: PayoutJobData[] }>;
}

const validPayout: PayoutJobData = {
  groupId: 'g1',
  amount: 100,
  recipient: 'alice@example.com',
  recipientType: 'paypal',
  currency: 'USD',
};

const invalidPayout: PayoutJobData = {
  groupId: '',       // missing — triggers validation error
  amount: 50,
  recipient: 'bob@example.com',
  recipientType: 'bank',
  currency: 'USD',
};

beforeEach(() => addBulkJobs.mockClear());

describe('processBatchPayoutJob – partial failure', () => {
  it('re-enqueues failed items after a partial batch failure', async () => {
    await expect(processBatchPayoutJob(makeJob([validPayout, invalidPayout]))).rejects.toThrow();

    expect(addBulkJobs).toHaveBeenCalledTimes(1);
    const [queueName, jobs] = addBulkJobs.mock.calls[0];
    expect(queueName).toBe('payout');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.recipient).toBe('bob@example.com');
  });

  it('throws so BullMQ marks the batch job as failed', async () => {
    await expect(
      processBatchPayoutJob(makeJob([validPayout, invalidPayout])),
    ).rejects.toThrow(/failed payouts/i);
  });

  it('does not re-enqueue anything when all items succeed', async () => {
    await processBatchPayoutJob(makeJob([validPayout]));
    expect(addBulkJobs).not.toHaveBeenCalled();
  });

  it('re-enqueues all items when the entire batch fails', async () => {
    await expect(
      processBatchPayoutJob(makeJob([invalidPayout, { ...invalidPayout, recipient: 'carol@example.com' }])),
    ).rejects.toThrow();

    const [, jobs] = addBulkJobs.mock.calls[0];
    expect(jobs).toHaveLength(2);
  });
});
