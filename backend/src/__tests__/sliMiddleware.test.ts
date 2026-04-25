import { Request, Response, NextFunction } from 'express';
import { sliMiddleware } from '../middleware/sliMiddleware';

// Mock metrics module
const mockObserveSuccess = jest.fn();
const mockObserveError = jest.fn();
const mockInc = jest.fn();

jest.mock('../lib/metrics', () => ({
  httpRequestDuration: { observe: mockObserveSuccess },
  errorRequestDuration: { observe: mockObserveError },
  sliBreachTotal: { inc: mockInc },
  SLI_BUDGETS: { general: { p95: 500, p99: 1000 } },
  resolveCategory: () => 'general',
}));

jest.mock('../lib/logger', () => ({
  createLogger: () => ({ warn: jest.fn() }),
}));

function makeRes(statusCode: number) {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    statusCode,
    on: (event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    },
    emit: (event: string) => listeners[event]?.forEach(cb => cb()),
  };
}

function makeReq() {
  return { method: 'GET', path: '/test', originalUrl: '/test', route: null } as unknown as Request;
}

beforeEach(() => {
  mockObserveSuccess.mockClear();
  mockObserveError.mockClear();
  mockInc.mockClear();
});

describe('sliMiddleware', () => {
  it('records 2xx duration in success histogram only', () => {
    const res = makeRes(200);
    sliMiddleware(makeReq(), res as unknown as Response, jest.fn() as NextFunction);
    res.emit('finish');

    expect(mockObserveSuccess).toHaveBeenCalledTimes(1);
    expect(mockObserveError).not.toHaveBeenCalled();
  });

  it('records 3xx duration in success histogram only', () => {
    const res = makeRes(301);
    sliMiddleware(makeReq(), res as unknown as Response, jest.fn() as NextFunction);
    res.emit('finish');

    expect(mockObserveSuccess).toHaveBeenCalledTimes(1);
    expect(mockObserveError).not.toHaveBeenCalled();
  });

  it('records 5xx duration in error histogram only, not success histogram', () => {
    const res = makeRes(500);
    sliMiddleware(makeReq(), res as unknown as Response, jest.fn() as NextFunction);
    res.emit('finish');

    expect(mockObserveError).toHaveBeenCalledTimes(1);
    expect(mockObserveSuccess).not.toHaveBeenCalled();
  });

  it('records 503 duration in error histogram only', () => {
    const res = makeRes(503);
    sliMiddleware(makeReq(), res as unknown as Response, jest.fn() as NextFunction);
    res.emit('finish');

    expect(mockObserveError).toHaveBeenCalledTimes(1);
    expect(mockObserveSuccess).not.toHaveBeenCalled();
  });

  it('does not fire SLI breach counter for 5xx responses', () => {
    const res = makeRes(500);
    sliMiddleware(makeReq(), res as unknown as Response, jest.fn() as NextFunction);
    res.emit('finish');

    expect(mockInc).not.toHaveBeenCalled();
  });

  it('calls next()', () => {
    const next = jest.fn();
    const res = makeRes(200);
    sliMiddleware(makeReq(), res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
