import { Response } from 'express';
import { Readable } from 'stream';
import { prisma } from '../lib/prisma';
import { paginatedQuery } from '../lib/paginatedQuery';

function makeStream(res: Response, headers: Record<string, string>): Readable {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
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
    const stream = makeStream(res, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="analytics.csv"',
    });
    stream.push('id,organizationId,platform,metric,value,recordedAt\n');
    await pump(stream, (args) => prisma.analyticsEntry.findMany({ where: { organizationId, recordedAt: { gte: startDate, lte: endDate } }, ...args }), (row) =>
      `${row.id},"${row.organizationId}","${row.platform}","${row.metric}",${row.value},"${row.recordedAt.toISOString()}"\n`,
    );
  },

  streamAnalyticsAsJSON: async (
    organizationId: string,
    startDate: Date,
    endDate: Date,
    res: Response,
  ): Promise<void> => {
    const stream = makeStream(res, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="analytics.jsonl"',
    });
    await pump(stream, (args) => prisma.analyticsEntry.findMany({ where: { organizationId, recordedAt: { gte: startDate, lte: endDate } }, ...args }), (row) =>
      JSON.stringify(row) + '\n',
    );
  },

  streamPostsAsCSV: async (
    organizationId: string,
    startDate: Date,
    endDate: Date,
    res: Response,
  ): Promise<void> => {
    const stream = makeStream(res, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="posts.csv"',
    });
    stream.push('id,organizationId,content,platform,scheduledAt,createdAt\n');
    await pump(stream, (args) => prisma.post.findMany({ where: { organizationId, createdAt: { gte: startDate, lte: endDate } }, ...args }), (row) => {
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
    const stream = makeStream(res, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="posts.jsonl"',
    });
    await pump(stream, (args) => prisma.post.findMany({ where: { organizationId, createdAt: { gte: startDate, lte: endDate } }, ...args }), (row) =>
      JSON.stringify(row) + '\n',
    );
  },
};
