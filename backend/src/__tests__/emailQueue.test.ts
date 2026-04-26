/**
 * emailQueue deduplication tests
 *
 * Verifies that sendEmail and sendTemplatedEmail derive a deterministic
 * BullMQ job ID so that a second enqueue for the same recipient + template
 * on the same day is a no-op.
 */

jest.mock('../queues/queueManager', () => ({
  queueManager: {
    createQueue: jest.fn(() => ({ name: 'email' })),
    addJob: jest.fn().mockResolvedValue('job-id'),
  },
}));

import { queueManager } from '../queues/queueManager';
import { sendEmail, sendTemplatedEmail, EmailJobData } from '../queues/emailQueue';

const addJob = queueManager.addJob as jest.Mock;

const baseEmail: EmailJobData = {
  to: 'user@example.com',
  subject: 'Welcome',
  body: 'Hello',
  metadata: { templateId: 'welcome' },
};

beforeEach(() => addJob.mockClear());

describe('sendEmail – deduplication', () => {
  it('passes a deterministic jobId derived from recipient + templateId + date', async () => {
    await sendEmail(baseEmail);

    const [, , , options] = addJob.mock.calls[0];
    expect(options.jobId).toMatch(/^user@example\.com:welcome:\d{4}-\d{2}-\d{2}$/);
  });

  it('produces the same jobId on a second call (no-op in BullMQ)', async () => {
    await sendEmail(baseEmail);
    await sendEmail(baseEmail);

    const id1 = addJob.mock.calls[0][3].jobId;
    const id2 = addJob.mock.calls[1][3].jobId;
    expect(id1).toBe(id2);
  });

  it('uses "default" as templateId when metadata is absent', async () => {
    const { metadata: _m, ...noMeta } = baseEmail;
    await sendEmail(noMeta);

    const [, , , options] = addJob.mock.calls[0];
    expect(options.jobId).toContain(':default:');
  });
});

describe('sendTemplatedEmail – deduplication', () => {
  it('passes a deterministic jobId derived from recipient + templateId + date', async () => {
    await sendTemplatedEmail('user@example.com', 'verify-email', { code: '123' });

    const [, , , options] = addJob.mock.calls[0];
    expect(options.jobId).toMatch(/^user@example\.com:verify-email:\d{4}-\d{2}-\d{2}$/);
  });

  it('produces the same jobId on a second call', async () => {
    await sendTemplatedEmail('user@example.com', 'verify-email', { code: '123' });
    await sendTemplatedEmail('user@example.com', 'verify-email', { code: '456' });

    const id1 = addJob.mock.calls[0][3].jobId;
    const id2 = addJob.mock.calls[1][3].jobId;
    expect(id1).toBe(id2);
  });

  it('produces different jobIds for different recipients', async () => {
    await sendTemplatedEmail('alice@example.com', 'welcome', {});
    await sendTemplatedEmail('bob@example.com', 'welcome', {});

    const id1 = addJob.mock.calls[0][3].jobId;
    const id2 = addJob.mock.calls[1][3].jobId;
    expect(id1).not.toBe(id2);
  });
});
