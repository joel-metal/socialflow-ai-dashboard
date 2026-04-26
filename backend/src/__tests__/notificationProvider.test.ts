import { createNotificationManager } from '../services/notificationProvider';

describe('notificationProvider worker alert context', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('includes queue name and last error in Slack alert text', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as typeof fetch;
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.test/services/example';

    const manager = createNotificationManager();

    await manager.sendAlert({
      severity: 'critical',
      service: 'worker-monitor',
      message: 'Worker image-sync emitted an error',
      details: {
        queueName: 'image-processing',
        lastErrorMessage: 'connection reset by peer',
      },
      timestamp: '2026-04-23T12:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.test/services/example',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(
          'Worker image-sync emitted an error (queue=image-processing, lastError=connection reset by peer)',
        ),
      }),
    );
  });

  it('includes queue name and last error in PagerDuty summary', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as typeof fetch;
    process.env.PAGERDUTY_INTEGRATION_KEY = 'pagerduty-key';

    const manager = createNotificationManager();

    await manager.sendAlert({
      severity: 'critical',
      service: 'worker-monitor',
      message: 'Worker image-sync restarted',
      details: {
        queueName: 'image-processing',
        lastErrorMessage: 'connection reset by peer',
      },
      timestamp: '2026-04-23T12:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://events.pagerduty.com/v2/enqueue',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(
          'worker-monitor: Worker image-sync restarted (queue=image-processing, lastError=connection reset by peer)',
        ),
      }),
    );
  });
});
