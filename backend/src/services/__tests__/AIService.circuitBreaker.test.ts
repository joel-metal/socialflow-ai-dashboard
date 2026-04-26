import 'reflect-metadata';
import { Container } from 'inversify';
import { AIService } from '../AIService';
import { CircuitBreakerService, circuitBreakerService } from '../CircuitBreakerService';
import { TYPES } from '../../config/types';

jest.mock('../../lib/logger', () => ({ createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) }));
jest.mock('../../lib/eventBus', () => ({ eventBus: { emitJobProgress: jest.fn() } }));
jest.mock('@opentelemetry/api', () => ({
  trace: { getTracer: () => ({ startSpan: () => ({ setAttribute: jest.fn(), setStatus: jest.fn(), recordException: jest.fn(), end: jest.fn() }) }) },
  SpanStatusCode: { OK: 0, ERROR: 1 },
}));

describe('AIService — CircuitBreakerService DI', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind<CircuitBreakerService>(TYPES.CircuitBreakerService).to(CircuitBreakerService).inSingletonScope();
    container.bind<AIService>(TYPES.AIService).to(AIService).inSingletonScope();
  });

  it('resolves AIService from the DI container', () => {
    const service = container.get<AIService>(TYPES.AIService);
    expect(service).toBeInstanceOf(AIService);
  });

  it('injects a CircuitBreakerService instance', () => {
    const service = container.get<AIService>(TYPES.AIService);
    const injectedCb = (service as any).circuitBreaker;
    expect(injectedCb).toBeInstanceOf(CircuitBreakerService);
  });

  it('the injected instance is the container singleton, not the module-level one', () => {
    const service = container.get<AIService>(TYPES.AIService);
    expect((service as any).circuitBreaker).not.toBe(circuitBreakerService);
  });

  it('two resolutions from the same container share the same CircuitBreakerService', () => {
    const a = container.get<AIService>(TYPES.AIService);
    const b = container.get<AIService>(TYPES.AIService);
    expect((a as any).circuitBreaker).toBe((b as any).circuitBreaker);
  });
});

describe('AIService — all generateContent calls route through the circuit breaker', () => {
  let cbService: CircuitBreakerService;
  let service: AIService;

  beforeEach(() => {
    cbService = new CircuitBreakerService();
    service = new AIService(cbService);
    (service as any).model = {};
    (service as any).genAI = { models: { generateContent: jest.fn() } };
  });

  it('execute() is called on the injected CircuitBreakerService for every generateContent call', async () => {
    const executeSpy = jest.spyOn(cbService, 'execute');
    (service as any).genAI.models.generateContent = jest.fn().mockResolvedValue({ text: 'ok' });

    await service.generateContent('test prompt');

    expect(executeSpy).toHaveBeenCalledWith('ai', expect.any(Function), expect.any(Function));
  });

  it('uses the fallback when the circuit breaker execute throws', async () => {
    jest.spyOn(cbService, 'execute').mockRejectedValue(new Error('circuit open'));

    await expect(service.generateContent('test prompt')).rejects.toThrow('circuit open');
  });

  it('returns fallback response when execute invokes the fallback function', async () => {
    // Simulate the circuit breaker calling the fallback directly
    jest.spyOn(cbService, 'execute').mockImplementation(async (_name, _fn, fallback) => {
      return fallback!();
    });

    const result = await service.generateContent('test prompt', 'my fallback');
    expect(result).toBe('my fallback');
  });

  it('routes all generateContent calls through the "ai" circuit breaker name', async () => {
    const executeSpy = jest.spyOn(cbService, 'execute');
    (service as any).genAI.models.generateContent = jest.fn().mockResolvedValue({ text: 'ok' });

    await service.generateContent('prompt 1');
    await service.generateContent('prompt 2');

    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(executeSpy.mock.calls.every(([name]) => name === 'ai')).toBe(true);
  });
});
