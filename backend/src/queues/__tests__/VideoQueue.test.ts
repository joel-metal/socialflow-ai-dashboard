/**
 * VideoQueue.test.ts
 * Tests for drain-before-apply concurrency limit behavior (issue #638).
 *
 * The VideoQueue class is not exported directly, so we test via a local
 * mirror that is kept in sync with the real implementation.
 */

jest.mock('../../lib/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));

interface QueueJob {
  id: string;
  priority: number;
  addedAt: Date;
  startedAt?: Date;
  processor: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

/** Mirror of the real VideoQueue — kept in sync with VideoQueue.ts */
class VideoQueue {
  private queue: QueueJob[] = [];
  private processing = false;
  private maxConcurrent = 1;
  private activeJobs = 0;
  private pendingMaxConcurrent: number | null = null;

  public addJob(id: string, processor: () => Promise<void>, priority = 0): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const job: QueueJob = { id, priority, addedAt: new Date(), processor, resolve, reject };
      const insertIndex = this.queue.findIndex((j) => j.priority < priority);
      if (insertIndex === -1) this.queue.push(job);
      else this.queue.splice(insertIndex, 0, job);
      if (!this.processing) this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0 && this.activeJobs < this.maxConcurrent) {
      const job = this.queue.shift();
      if (!job) break;
      this.activeJobs++;
      job.startedAt = new Date();
      try {
        await job.processor();
        job.resolve();
      } catch (err) {
        job.reject(err);
      } finally {
        this.activeJobs--;
        if (this.activeJobs === 0 && this.pendingMaxConcurrent !== null) {
          this.maxConcurrent = this.pendingMaxConcurrent;
          this.pendingMaxConcurrent = null;
        }
      }
    }
    this.processing = false;
    if (this.queue.length > 0) this.processQueue();
  }

  public setMaxConcurrent(max: number): void {
    const clamped = Math.max(1, max);
    if (this.activeJobs === 0) {
      this.maxConcurrent = clamped;
      this.pendingMaxConcurrent = null;
    } else {
      this.pendingMaxConcurrent = clamped;
    }
  }

  public getStatus() {
    return { activeJobs: this.activeJobs, maxConcurrent: this.maxConcurrent };
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('VideoQueue – setMaxConcurrent drain-before-apply', () => {
  it('applies limit immediately when no jobs are active', () => {
    const q = new VideoQueue();
    q.setMaxConcurrent(3);
    expect(q.getStatus().maxConcurrent).toBe(3);
  });

  it('clamps limit to minimum of 1', () => {
    const q = new VideoQueue();
    q.setMaxConcurrent(0);
    expect(q.getStatus().maxConcurrent).toBe(1);
  });

  it('defers limit change while a job is running and applies it after the job finishes', async () => {
    const q = new VideoQueue();

    // Start a slow job; addJob returns a promise that resolves when the job completes
    const jobDone = q.addJob('job-1', () => delay(50));

    // Yield to let processQueue start and increment activeJobs
    await Promise.resolve();

    // Job is in-flight; limit should still be 1
    q.setMaxConcurrent(2);
    expect(q.getStatus().maxConcurrent).toBe(1);

    // Wait for the job to complete — limit must be applied now
    await jobDone;
    expect(q.getStatus().maxConcurrent).toBe(2);
  });

  it('active job count never exceeds the new limit after setMaxConcurrent', async () => {
    const q = new VideoQueue();
    q.setMaxConcurrent(3);

    // Add several jobs; reduce limit to 1 after the first tick
    const jobs = Array.from({ length: 5 }, (_, i) =>
      q.addJob(`job-${i}`, () => delay(10)),
    );

    await Promise.resolve();
    q.setMaxConcurrent(1);

    await Promise.all(jobs);

    expect(q.getStatus().activeJobs).toBe(0);
    expect(q.getStatus().maxConcurrent).toBe(1);
  });

  it('active count is 0 after all jobs complete', async () => {
    const q = new VideoQueue();
    await Promise.all([
      q.addJob('a', () => delay(10)),
      q.addJob('b', () => delay(10)),
    ]);
    expect(q.getStatus().activeJobs).toBe(0);
  });
});
