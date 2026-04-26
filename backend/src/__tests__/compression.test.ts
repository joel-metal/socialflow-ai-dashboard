/**
 * compression middleware – shouldCompress tests
 *
 * Verifies that responses already carrying a Content-Encoding header are
 * not re-compressed, while normal compressible responses still pass through.
 */

import { Request, Response } from 'express';

// Re-export the private shouldCompress via a thin test shim by importing the
// module and relying on the fact that compressionMiddleware uses it internally.
// We test the observable behaviour: the filter function passed to `compression`.

// Capture the filter option by mocking the `compression` package before import.
let capturedFilter: ((req: Request, res: Response) => boolean) | undefined;

jest.mock('compression', () => {
  const actual = jest.requireActual<typeof import('compression')>('compression');
  const mock = jest.fn((opts: any) => {
    capturedFilter = opts?.filter;
    return actual(opts);
  }) as any;
  mock.filter = actual.filter;
  return mock;
});

// Import after mock is set up so capturedFilter is populated.
require('../middleware/compression');

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes(headers: Record<string, string | string[]> = {}): Response {
  return {
    getHeader: (name: string) => headers[name.toLowerCase()],
  } as unknown as Response;
}

describe('shouldCompress – Content-Encoding guard', () => {
  it('returns false when Content-Encoding is set to gzip', () => {
    const result = capturedFilter!(
      makeReq(),
      makeRes({ 'content-encoding': 'gzip' }),
    );
    expect(result).toBe(false);
  });

  it('returns false when Content-Encoding is set to br', () => {
    const result = capturedFilter!(
      makeReq(),
      makeRes({ 'content-encoding': 'br' }),
    );
    expect(result).toBe(false);
  });

  it('returns false when Content-Encoding is set to deflate', () => {
    const result = capturedFilter!(
      makeReq(),
      makeRes({ 'content-encoding': 'deflate' }),
    );
    expect(result).toBe(false);
  });

  it('does not skip compression when Content-Encoding is absent', () => {
    // text/html is compressible — should not be blocked by the encoding guard
    const result = capturedFilter!(
      makeReq(),
      makeRes({ 'content-type': 'text/html; charset=utf-8' }),
    );
    expect(result).toBe(true);
  });

  it('still respects x-no-compression opt-out regardless of Content-Encoding', () => {
    const result = capturedFilter!(
      makeReq({ 'x-no-compression': '1' }),
      makeRes({ 'content-type': 'text/html' }),
    );
    expect(result).toBe(false);
  });
});
