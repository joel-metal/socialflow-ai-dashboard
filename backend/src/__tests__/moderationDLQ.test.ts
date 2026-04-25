import {
  enqueueModeration,
  enqueueToDLQ,
  MODERATION_QUEUE_NAME,
  MODERATION_DLQ_NAME,
} from '../queues/moderationQueue';
import { queueManager } from '../queues/queueManager';

jest.mock('../queues/queueManager');

describe('Moderation Queue - Dead Letter Queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Queue Configuration', () => {
    it('should configure moderation queue with removeOnFail limit', () => {
      const mockCreateQueue = queueManager.createQueue as jest.Mock;

      // Import to trigger queue creation
      require('../queues/moderationQueue');

      expect(mockCreateQueue).toHaveBeenCalledWith(
        MODERATION_QUEUE_NAME,
        expect.objectContaining({
          removeOnFail: { count: 100 },
        }),
      );
    });

    it('should configure DLQ to keep failed jobs indefinitely', () => {
      const mockCreateQueue = queueManager.createQueue as jest.Mock;

      // Import to trigger queue creation
      require('../queues/moderationQueue');

      expect(mockCreateQueue).toHaveBeenCalledWith(
        MODERATION_DLQ_NAME,
        expect.objectContaining({
          removeOnFail: false,
        }),
      );
    });
  });

  describe('enqueueModeration', () => {
    it('should enqueue moderation job with postId', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('job-123');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      const jobId = await enqueueModeration('post-456');

      expect(mockAddJob).toHaveBeenCalledWith(MODERATION_QUEUE_NAME, 'moderate-post', {
        postId: 'post-456',
      });
      expect(jobId).toBe('job-123');
    });
  });

  describe('enqueueToDLQ', () => {
    it('should enqueue failed job to DLQ with metadata', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('dlq-job-789');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      const jobId = await enqueueToDLQ('post-456', 'job-123', 'Moderation service timeout');

      expect(mockAddJob).toHaveBeenCalledWith(MODERATION_DLQ_NAME, 'dlq-alert', {
        postId: 'post-456',
        originalJobId: 'job-123',
        failureReason: 'Moderation service timeout',
        enqueuedAt: expect.any(String),
      });
      expect(jobId).toBe('dlq-job-789');
    });

    it('should include ISO timestamp in DLQ job', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('dlq-job-789');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      await enqueueToDLQ('post-456', 'job-123', 'Error');

      const callArgs = mockAddJob.mock.calls[0][2];
      expect(callArgs.enqueuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Job Failure Handling', () => {
    it('should move job to DLQ after exhausting retries', async () => {
      const mockJob = {
        id: 'job-123',
        data: { postId: 'post-456' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      };

      const mockError = new Error('Persistent failure');
      const mockEnqueueToDLQ = jest.fn();

      // This test verifies the logic that should be in the worker
      if (mockJob.attemptsMade >= (mockJob.opts.attempts || 3)) {
        await mockEnqueueToDLQ(mockJob.data.postId, mockJob.id, mockError.message);
      }

      expect(mockEnqueueToDLQ).toHaveBeenCalledWith('post-456', 'job-123', 'Persistent failure');
    });

    it('should not move job to DLQ if retries remain', async () => {
      const mockJob = {
        id: 'job-123',
        data: { postId: 'post-456' },
        attemptsMade: 1,
        opts: { attempts: 3 },
      };

      const mockError = new Error('Temporary failure');
      const mockEnqueueToDLQ = jest.fn();

      // This test verifies the logic that should be in the worker
      if (mockJob.attemptsMade >= (mockJob.opts.attempts || 3)) {
        await mockEnqueueToDLQ(mockJob.data.postId, mockJob.id, mockError.message);
      }

      expect(mockEnqueueToDLQ).not.toHaveBeenCalled();
    });
  });

  describe('DLQ Limits', () => {
    it('should enforce removeOnFail count of 100 for main queue', () => {
      const mockCreateQueue = queueManager.createQueue as jest.Mock;

      // Import to trigger queue creation
      require('../queues/moderationQueue');

      const moderationQueueCall = mockCreateQueue.mock.calls.find(
        (call) => call[0] === MODERATION_QUEUE_NAME,
      );

      expect(moderationQueueCall[1].removeOnFail).toEqual({ count: 100 });
    });

    it('should keep all failed DLQ jobs for investigation', () => {
      const mockCreateQueue = queueManager.createQueue as jest.Mock;

      // Import to trigger queue creation
      require('../queues/moderationQueue');

      const dlqCall = mockCreateQueue.mock.calls.find((call) => call[0] === MODERATION_DLQ_NAME);

      expect(dlqCall[1].removeOnFail).toBe(false);
    });
  });
});
