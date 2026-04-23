import { DynamicConfigService } from '../DynamicConfigService';

// Prevent real DB calls
jest.mock('../../lib/prisma', () => ({
  prisma: { dynamicConfig: { findMany: jest.fn().mockResolvedValue([]) } },
}));

describe('DynamicConfigService – poll interval', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses the provided interval (default 60 000 ms)', () => {
    const svc = new DynamicConfigService(60000);
    const refreshSpy = jest.spyOn(svc as any, 'refreshCache').mockResolvedValue(undefined);

    svc.stopPolling();
    (svc as any).pollingInterval = null;
    svc.startPolling();

    jest.advanceTimersByTime(60000);
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60000);
    expect(refreshSpy).toHaveBeenCalledTimes(2);

    svc.stopPolling();
  });

  it('respects a custom interval passed to the constructor', () => {
    const svc = new DynamicConfigService(5000);
    const refreshSpy = jest.spyOn(svc as any, 'refreshCache').mockResolvedValue(undefined);

    svc.stopPolling();
    (svc as any).pollingInterval = null;
    svc.startPolling();

    jest.advanceTimersByTime(5000);
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    // Should NOT fire again before the next 5 s window
    jest.advanceTimersByTime(4999);
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    svc.stopPolling();
  });

  it('reads DYNAMIC_CONFIG_POLL_INTERVAL_MS from env via config', () => {
    // The singleton is constructed with config.DYNAMIC_CONFIG_POLL_INTERVAL_MS.
    // We verify the env var is wired up by checking the schema default.
    const originalEnv = process.env.DYNAMIC_CONFIG_POLL_INTERVAL_MS;
    process.env.DYNAMIC_CONFIG_POLL_INTERVAL_MS = '15000';

    // Re-import to pick up the new env value
    jest.resetModules();
    const { validateEnv } = require('../../config/config');
    const cfg = validateEnv(process.env);
    expect(cfg.DYNAMIC_CONFIG_POLL_INTERVAL_MS).toBe(15000);

    process.env.DYNAMIC_CONFIG_POLL_INTERVAL_MS = originalEnv;
  });

  it('defaults to 60 000 ms when env var is not set', () => {
    jest.resetModules();
    const saved = process.env.DYNAMIC_CONFIG_POLL_INTERVAL_MS;
    delete process.env.DYNAMIC_CONFIG_POLL_INTERVAL_MS;

    const { validateEnv } = require('../../config/config');
    const cfg = validateEnv(process.env);
    expect(cfg.DYNAMIC_CONFIG_POLL_INTERVAL_MS).toBe(60000);

    process.env.DYNAMIC_CONFIG_POLL_INTERVAL_MS = saved;
  });
});
