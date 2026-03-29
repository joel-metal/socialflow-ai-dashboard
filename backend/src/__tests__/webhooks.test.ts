// Must be set before any module import
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import crypto from 'crypto';

// ── Mock prisma before importing dispatcher ───────────────────────────────────
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockFindMany = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    webhookSubscription: { findMany: mockFindMany },
    webhookDelivery: { create: mockCreate, update: mockUpdate, findMany: jest.fn() },
  },
}));

// ── Mock fetch globally ───────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { attemptDelivery, dispatchEvent } from '../services/WebhookDispatcher';

beforeEach(() => jest.clearAllMocks());

// ── dispatchEvent ─────────────────────────────────────────────────────────────
describe('dispatchEvent', () => {
  it('does nothing when no active subscribers', async () => {
    mockFindMany.mockResolvedValue([]);
    await dispatchEvent('post.published', { postId: '1' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates a delivery record for each subscriber', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'sub-1', url: 'https://example.com/hook', secret: 'secret' },
    ]);
    mockCreate.mockResolvedValue({ id: 'del-1' });
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    mockUpdate.mockResolvedValue({});

    await dispatchEvent('post.published', { postId: '42' });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'post.published', status: 'pending' }),
      }),
    );
  });
});

// ── attemptDelivery ───────────────────────────────────────────────────────────
describe('attemptDelivery', () => {
  const url = 'https://example.com/hook';
  const secret = 'my-signing-secret';
  const payload = '{"event":"post.published"}';

  it('marks delivery as success on 2xx response', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    mockUpdate.mockResolvedValue({});

    await attemptDelivery('del-1', url, secret, payload, 1);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'success', attempts: 1 }),
      }),
    );
  });

  it('schedules retry on non-2xx response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'error' });
    mockUpdate.mockResolvedValue({});

    await attemptDelivery('del-1', url, secret, payload, 1);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending', nextRetryAt: expect.any(Date) }),
      }),
    );
  });

  it('marks permanently failed after MAX_ATTEMPTS (5)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'error' });
    mockUpdate.mockResolvedValue({});

    await attemptDelivery('del-1', url, secret, payload, 5);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', nextRetryAt: null }),
      }),
    );
  });

  it('schedules retry on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    mockUpdate.mockResolvedValue({});

    await attemptDelivery('del-1', url, secret, payload, 2);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending', errorMessage: 'ECONNREFUSED' }),
      }),
    );
  });

  it('sends correct HMAC-SHA256 signature header', async () => {
    const expectedSig =
      'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    mockUpdate.mockResolvedValue({});

    await attemptDelivery('del-1', url, secret, payload, 1);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['X-SocialFlow-Signature']).toBe(expectedSig);
  });

  it('includes X-SocialFlow-Delivery header with delivery id', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    mockUpdate.mockResolvedValue({});

    await attemptDelivery('del-xyz', url, secret, payload, 1);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['X-SocialFlow-Delivery']).toBe('del-xyz');
  });
});
