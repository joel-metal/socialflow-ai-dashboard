/**
 * QueueManager.closeAll – graceful shutdown ordering tests
 *
 * Verifies that workers are fully drained before queues/events and the
 * Redis client are closed, so no in-flight job results are lost.
 */

// ── mocks ─────────────────────────────────────────────────────────────────────

// Track call order across all mock close() calls
const callOrder: string[] = [];

const mockWorkerClose = jest.fn(() => {
  callOrder.push('worker');
  return Promise.resolve();
});

const mockQueueClose = jest.fn(() => {
  callOrder.push('queue');
  return Promise.resolve();
});

const mockEventsClose = jest.fn(() => {
  callOrder.push('events');
  return Promise.resolve();
});

const mockRedisQuit = jest.fn(() => {
  callOrder.push('redis');
  return Promise.resolve('OK' as const);
});

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    quit: mockRedisQuit,
    on: jest.fn(),
  }));
});

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    close: mockQueueClose,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    close: mockWorkerClose,
    on: jest.fn(),
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({
    close: mockEventsClose,
    on: jest.fn(),
  })),
}));

jest.mock('../config/config', () => ({
  config: {
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: undefined,
  },
}));

// ── tests ─────────────────────────────────────────────────────────────────────

import { QueueManager } from '../queues/queueManager';

beforeEach(() => {
  callOrder.length = 0;
  mockWorkerClose.mockClear();
  mockQueueClose.mockClear();
  mockEventsClose.mockClear();
  mockRedisQuit.mockClear();
});

describe('QueueManager.closeAll – shutdown ordering', () => {
  it('closes workers before queues/events and Redis', async () => {
    const manager = new QueueManager();
    manager.createQueue('test-queue', {});
    manager.createWorker('test-queue', jest.fn());

    await manager.closeAll();

    const workerIdx = callOrder.indexOf('worker');
    const queueIdx = callOrder.indexOf('queue');
    const redisIdx = callOrder.indexOf('redis');

    expect(workerIdx).toBeLessThan(queueIdx);
    expect(workerIdx).toBeLessThan(redisIdx);
  });

  it('closes Redis after queues and events', async () => {
    const manager = new QueueManager();
    manager.createQueue('test-queue', {});

    await manager.closeAll();

    const queueIdx = callOrder.indexOf('queue');
    const redisIdx = callOrder.indexOf('redis');

    expect(queueIdx).toBeLessThan(redisIdx);
  });

  it('calls close on every registered worker', async () => {
    const manager = new QueueManager();
    manager.createQueue('q1', {});
    manager.createQueue('q2', {});
    manager.createWorker('q1', jest.fn());
    manager.createWorker('q2', jest.fn());

    await manager.closeAll();

    expect(mockWorkerClose).toHaveBeenCalledTimes(2);
  });

  it('calls quit on the Redis client exactly once', async () => {
    const manager = new QueueManager();
    await manager.closeAll();
    expect(mockRedisQuit).toHaveBeenCalledTimes(1);
  });
});
