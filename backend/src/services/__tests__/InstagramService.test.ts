import { ServiceUnavailableError } from '../../lib/errors';

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('../CircuitBreakerService', () => ({
  circuitBreakerService: {
    execute: jest.fn((_name: string, fn: () => unknown) => fn()),
  },
}));

jest.mock('../../lib/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.useFakeTimers();

import { instagramService } from '../InstagramService';

function statusResponse(statusCode: string): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status_code: statusCode, status: statusCode }),
  } as Response);
}

const svc = instagramService as any;

describe('InstagramService.waitForContainer', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllTimers();
  });

  it('throws ServiceUnavailableError after maxRetries attempts', async () => {
    mockFetch.mockImplementation(() => statusResponse('IN_PROGRESS'));

    let caught: unknown;
    const promise = svc.waitForContainer('ig-1', 'ctr-1', 'tok', 3, 100)
      .catch((e: unknown) => { caught = e; });

    await jest.runAllTimersAsync();
    await promise;

    expect(caught).toBeInstanceOf(ServiceUnavailableError);
    expect((caught as Error).message).toMatch(/did not finish processing after 3 attempts/);
  });

  it('resolves immediately when first poll returns FINISHED', async () => {
    mockFetch.mockImplementationOnce(() => statusResponse('FINISHED'));

    await expect(svc.waitForContainer('ig-1', 'ctr-3', 'tok', 3, 100)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('resolves after a few IN_PROGRESS polls then FINISHED', async () => {
    mockFetch
      .mockImplementationOnce(() => statusResponse('IN_PROGRESS'))
      .mockImplementationOnce(() => statusResponse('IN_PROGRESS'))
      .mockImplementationOnce(() => statusResponse('FINISHED'));

    const promise = svc.waitForContainer('ig-1', 'ctr-4', 'tok', 5, 100);
    await jest.runAllTimersAsync();

    await expect(promise).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on ERROR status without consuming retries', async () => {
    mockFetch.mockImplementationOnce(() => statusResponse('ERROR'));

    await expect(svc.waitForContainer('ig-1', 'ctr-5', 'tok', 30, 100)).rejects.toThrow(
      /container processing failed with status: ERROR/,
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on EXPIRED status', async () => {
    mockFetch.mockImplementationOnce(() => statusResponse('EXPIRED'));

    await expect(svc.waitForContainer('ig-1', 'ctr-6', 'tok', 30, 100)).rejects.toThrow(
      /container processing failed with status: EXPIRED/,
    );
  });

  it('caps backoff delay at 30 seconds', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    mockFetch.mockImplementation(() => statusResponse('IN_PROGRESS'));

    const promise = svc.waitForContainer('ig-1', 'ctr-7', 'tok', 3, 1000)
      .catch(() => { /* expected */ });
    await jest.runAllTimersAsync();
    await promise;

    const delays = setTimeoutSpy.mock.calls
      .map((c) => c[1] as number)
      .filter((d) => d !== undefined);
    expect(delays.length).toBeGreaterThan(0);
    expect(delays.every((d) => d <= 30_000)).toBe(true);
    setTimeoutSpy.mockRestore();
  });
});
