import { ExportService } from '../ExportService';
import { prisma } from '../../lib/prisma';
import { Response } from 'express';
import { PassThrough } from 'stream';

jest.mock('../../lib/prisma', () => ({
  prisma: {
    analyticsEntry: { findMany: jest.fn() },
    post: { findMany: jest.fn() },
  },
}));

const BATCH_SIZE = 1000;
const START = new Date('2025-01-01');
const END = new Date('2025-12-31');

/**
 * The service calls `stream.pipe(res)` — so res must be a real Writable.
 * We use a PassThrough and bolt setHeader onto it.
 */
function makeRes(): { res: Response; output(): Promise<string> } {
  const pt = new PassThrough();
  const chunks: Buffer[] = [];
  pt.on('data', (c) => chunks.push(c));
  (pt as any).setHeader = jest.fn();
  return {
    res: pt as unknown as Response,
    output: () =>
      new Promise((resolve, reject) => {
        pt.on('end', () => resolve(Buffer.concat(chunks).toString()));
        pt.on('error', reject);
      }),
  };
}

function analyticsRow(id: string) {
  return { id, organizationId: 'org-1', platform: 'twitter', metric: 'impressions', value: 1, recordedAt: new Date('2025-06-15') };
}
function postRow(id: string) {
  return { id, organizationId: 'org-1', content: 'hello', platform: 'twitter', scheduledAt: null, createdAt: new Date('2025-06-15') };
}

/** Parse CSV output into data row IDs (skips header). */
function csvIds(output: string): string[] {
  return output.split('\n').slice(1).filter(Boolean).map((l) => l.split(',')[0]);
}

beforeEach(() => jest.clearAllMocks());

// ── Original tests (preserved) ────────────────────────────────────────────────

describe('streamAnalyticsAsCSV', () => {
  it('sets correct headers', async () => {
    (prisma.analyticsEntry.findMany as jest.Mock).mockResolvedValue([]);
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-1', START, END, res);
    await output();
    expect((res as any).setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect((res as any).setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="analytics.csv"');
  });

  it('queries with correct date range and organizationId', async () => {
    (prisma.analyticsEntry.findMany as jest.Mock).mockResolvedValue([]);
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-123', START, END, res);
    await output();
    expect(prisma.analyticsEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-123', recordedAt: { gte: START, lte: END } }) }),
    );
  });

  it('uses cursor-based pagination across two fetches', async () => {
    const page1 = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => analyticsRow(`id-${i}`));
    (prisma.analyticsEntry.findMany as jest.Mock)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce([]);
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-1', START, END, res);
    await output();
    expect(prisma.analyticsEntry.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.analyticsEntry.findMany).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ cursor: { id: 'id-999' }, skip: 1 }),
    );
  });
});

describe('streamAnalyticsAsJSON', () => {
  it('sets correct headers', async () => {
    (prisma.analyticsEntry.findMany as jest.Mock).mockResolvedValue([]);
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsJSON('org-1', START, END, res);
    await output();
    expect((res as any).setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-ndjson; charset=utf-8');
    expect((res as any).setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="analytics.jsonl"');
  });
});

describe('streamPostsAsCSV', () => {
  it('sets correct headers', async () => {
    (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
    const { res, output } = makeRes();
    await ExportService.streamPostsAsCSV('org-1', START, END, res);
    await output();
    expect((res as any).setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect((res as any).setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="posts.csv"');
  });

  it('escapes double-quotes in post content', async () => {
    (prisma.post.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'p1', organizationId: 'org-1', content: 'Say "hi"', platform: 'twitter', scheduledAt: null, createdAt: new Date('2025-06-15') }])
      .mockResolvedValueOnce([]);
    const { res, output } = makeRes();
    await ExportService.streamPostsAsCSV('org-1', START, END, res);
    expect(await output()).toContain('Say ""hi""');
  });
});

describe('streamPostsAsJSON', () => {
  it('sets correct headers', async () => {
    (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
    const { res, output } = makeRes();
    await ExportService.streamPostsAsJSON('org-1', START, END, res);
    await output();
    expect((res as any).setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-ndjson; charset=utf-8');
    expect((res as any).setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="posts.jsonl"');
  });
});

// ── Pagination boundary tests ─────────────────────────────────────────────────

describe('pagination boundaries', () => {
  it('exact page size (1000) — single fetch, hasMore becomes false', async () => {
    (prisma.analyticsEntry.findMany as jest.Mock)
      .mockResolvedValueOnce(Array.from({ length: BATCH_SIZE }, (_, i) => analyticsRow(`r-${i}`)));
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-1', START, END, res);
    expect(csvIds(await output())).toHaveLength(BATCH_SIZE);
    expect(prisma.analyticsEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it('BATCH_SIZE + 1 — sentinel stripped, second fetch issued', async () => {
    const page1 = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => analyticsRow(`r-${i}`));
    (prisma.analyticsEntry.findMany as jest.Mock)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce([]);
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-1', START, END, res);
    const ids = csvIds(await output());
    expect(ids).toHaveLength(BATCH_SIZE);
    expect(ids).not.toContain(`r-${BATCH_SIZE}`); // sentinel never emitted
    expect(prisma.analyticsEntry.findMany).toHaveBeenCalledTimes(2);
  });

  it('cursor points to last emitted record (not the sentinel)', async () => {
    const page1 = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => analyticsRow(`r-${String(i).padStart(4, '0')}`));
    (prisma.analyticsEntry.findMany as jest.Mock)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce([]);
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-1', START, END, res);
    await output();
    // After pop(), last item is index 999 → cursor = r-0999
    expect(prisma.analyticsEntry.findMany).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ cursor: { id: 'r-0999' }, skip: 1 }),
    );
  });

  it('final page shorter than BATCH_SIZE — no extra fetch', async () => {
    (prisma.analyticsEntry.findMany as jest.Mock)
      .mockResolvedValueOnce(Array.from({ length: 7 }, (_, i) => analyticsRow(`last-${i}`)));
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-1', START, END, res);
    expect(csvIds(await output())).toHaveLength(7);
    expect(prisma.analyticsEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it('empty result — only CSV header, no data rows', async () => {
    (prisma.analyticsEntry.findMany as jest.Mock).mockResolvedValueOnce([]);
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-1', START, END, res);
    const lines = (await output()).split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,organizationId,platform,metric,value,recordedAt');
  });

  it('sparse IDs across two pages — no duplication, no omission', async () => {
    // page1: BATCH_SIZE+1 items (last is sentinel with sparse id)
    const page1 = [
      ...Array.from({ length: BATCH_SIZE - 1 }, (_, i) => analyticsRow(`dense-${i}`)),
      analyticsRow('sparse-A'),
      analyticsRow('sparse-B'), // sentinel — must be stripped
    ];
    // page2: 3 items (< BATCH_SIZE → last page)
    const page2 = [analyticsRow('sparse-C'), analyticsRow('sparse-D'), analyticsRow('sparse-E')];
    (prisma.analyticsEntry.findMany as jest.Mock)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-1', START, END, res);
    const ids = csvIds(await output());
    expect(ids).toHaveLength(BATCH_SIZE + 3); // BATCH_SIZE from page1 + 3 from page2
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids).not.toContain('sparse-B');       // sentinel stripped
    expect(ids).toContain('sparse-E');            // last record present
    expect(prisma.analyticsEntry.findMany).toHaveBeenCalledTimes(2);
  });

  it('multi-page full export — correct total, no duplicates', async () => {
    const page1 = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => analyticsRow(`p1-${i}`));
    const page2 = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => analyticsRow(`p2-${i}`));
    const page3 = Array.from({ length: 42 }, (_, i) => analyticsRow(`p3-${i}`));
    (prisma.analyticsEntry.findMany as jest.Mock)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(page3);
    const { res, output } = makeRes();
    await ExportService.streamAnalyticsAsCSV('org-1', START, END, res);
    const ids = csvIds(await output());
    expect(ids).toHaveLength(BATCH_SIZE * 2 + 42);
    expect(new Set(ids).size).toBe(ids.length);
    expect(prisma.analyticsEntry.findMany).toHaveBeenCalledTimes(3);
  });

  it('posts: exact page size — single fetch, all rows emitted', async () => {
    (prisma.post.findMany as jest.Mock)
      .mockResolvedValueOnce(Array.from({ length: BATCH_SIZE }, (_, i) => postRow(`post-${i}`)));
    const { res, output } = makeRes();
    await ExportService.streamPostsAsCSV('org-1', START, END, res);
    const ids = csvIds(await output());
    expect(ids).toHaveLength(BATCH_SIZE);
    expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
  });

  it('posts: BATCH_SIZE + 1 — sentinel stripped, cursor advanced', async () => {
    const page1 = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => postRow(`post-${String(i).padStart(4, '0')}`));
    (prisma.post.findMany as jest.Mock)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce([]);
    const { res, output } = makeRes();
    await ExportService.streamPostsAsCSV('org-1', START, END, res);
    const ids = csvIds(await output());
    expect(ids).toHaveLength(BATCH_SIZE);
    expect(ids).not.toContain(`post-${String(BATCH_SIZE).padStart(4, '0')}`);
    expect(prisma.post.findMany).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ cursor: { id: 'post-0999' }, skip: 1 }),
    );
  });
});
