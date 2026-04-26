import { encodeCursor, decodeCursor } from '../utils/pagination';

describe('encodeCursor / decodeCursor', () => {
  const base = { id: 'abc-123', createdAt: new Date('2025-01-01T00:00:00.000Z') };

  it('encodes and decodes a record with updatedAt set', () => {
    const record = { ...base, updatedAt: new Date('2025-06-15T12:00:00.000Z') };
    const cursor = encodeCursor(record);
    const decoded = decodeCursor(cursor);

    expect(decoded).toEqual({ id: 'abc-123', timestamp: '2025-06-15T12:00:00.000Z' });
  });

  it('falls back to createdAt when updatedAt is null', () => {
    const record = { ...base, updatedAt: null };
    const cursor = encodeCursor(record);
    const decoded = decodeCursor(cursor);

    expect(decoded).toEqual({ id: 'abc-123', timestamp: '2025-01-01T00:00:00.000Z' });
  });

  it('falls back to createdAt when updatedAt is undefined', () => {
    const cursor = encodeCursor(base); // no updatedAt field
    const decoded = decodeCursor(cursor);

    expect(decoded).toEqual({ id: 'abc-123', timestamp: '2025-01-01T00:00:00.000Z' });
  });

  it('returns null for a malformed cursor', () => {
    expect(decodeCursor('not-valid-base64!!')).toBeNull();
    expect(decodeCursor(Buffer.from('{"bad":true}').toString('base64'))).toBeNull();
  });
});
