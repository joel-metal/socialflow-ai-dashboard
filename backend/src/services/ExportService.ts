import { Response } from 'express';
import { Readable } from 'stream';
import { prisma } from '../lib/prisma';
import { paginatedQuery } from '../lib/paginatedQuery';

function makeStream(res: Response, headers: Record<string, string>, contentLength?: number): Readable {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (contentLength !== undefined) res.setHeader('Content-Length', contentLength);
  const stream = new Readable({ read() {} });
  stream.pipe(res);
  return stream;
}

async function pump<T extends { id: string }>(
  stream: Readable,
  findMany: Parameters<typeof paginatedQuery<T>>[0],
  serialize: (row: T) => string,
): Promise<void> {
  try {
    for await (const row of paginatedQuery(findMany)) {
      stream.push(serialize(row));
    }
    stream.push(null);
  } catch (err) {
    stream.destroy(err as Error);
  }
}

export const ExportService = {
  streamAnalyticsAsCSV: async (
    organizationId: string,
    startDate: Date,
    endDate: Date,
    res: Response,
  ): Promise<void> => {
    const where = { organizationId, recordedAt: { gte: startDate, lte: endDate } };
    const count = await prisma.analyticsEntry.count({ where });
    const header = 'id,organizationId,platform,metric,value,recordedAt\n';
    // Each row: id(~36) + orgId(~36) + platform(~10) + metric(~15) + value(~5) + date(~24) + delimiters ≈ 140 bytes
    const contentLength = Buffer.byteLength(header) + count * 140;
    const stream = makeStream(res, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="analytics.csv"',
    }, contentLength);
    stream.push(header);
    await pump(stream, (args) => prisma.analyticsEntry.findMany({ where, ...args }), (row) =>
      `${row.id},"${row.organizationId}","${row.platform}","${row.metric}",${row.value},"${row.recordedAt.toISOString()}"\n`,
    );
  },

  streamAnalyticsAsJSON: async (
    organizationId: string,
    startDate: Date,
    endDate: Date,
    res: Response,
  ): Promise<void> => {
    const where = { organizationId, recordedAt: { gte: startDate, lte: endDate } };
    const count = await prisma.analyticsEntry.count({ where });
    // Each NDJSON row estimate: ~200 bytes
    const contentLength = count * 200;
    const stream = makeStream(res, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="analytics.jsonl"',
    }, contentLength);
    await pump(stream, (args) => prisma.analyticsEntry.findMany({ where, ...args }), (row) =>
      JSON.stringify(row) + '\n',
    );
  },

  streamPostsAsCSV: async (
    organizationId: string,
    startDate: Date,
    endDate: Date,
    res: Response,
  ): Promise<void> => {
    const where = { organizationId, createdAt: { gte: startDate, lte: endDate } };
    const count = await prisma.post.count({ where });
    const header = 'id,organizationId,content,platform,scheduledAt,createdAt\n';
    // Each row estimate: ~300 bytes (content can vary)
    const contentLength = Buffer.byteLength(header) + count * 300;
    const stream = makeStream(res, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="posts.csv"',
    }, contentLength);
    stream.push(header);
    await pump(stream, (args) => prisma.post.findMany({ where, ...args }), (row) => {
      const content = row.content.replace(/"/g, '""');
      return `${row.id},"${row.organizationId}","${content}","${row.platform}","${row.scheduledAt?.toISOString() || ''}","${row.createdAt.toISOString()}"\n`;
    });
  },

  streamPostsAsJSON: async (
    organizationId: string,
    startDate: Date,
    endDate: Date,
    res: Response,
  ): Promise<void> => {
    const where = { organizationId, createdAt: { gte: startDate, lte: endDate } };
    const count = await prisma.post.count({ where });
    // Each NDJSON row estimate: ~350 bytes
    const contentLength = count * 350;
    const stream = makeStream(res, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="posts.jsonl"',
    }, contentLength);
    await pump(stream, (args) => prisma.post.findMany({ where, ...args }), (row) =>
      JSON.stringify(row) + '\n',
    );
  },
};
