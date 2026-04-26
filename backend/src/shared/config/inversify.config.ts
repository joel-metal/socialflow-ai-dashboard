import 'reflect-metadata';
import { Container } from 'inversify';
import { createLogger } from '../lib/logger';

const logger = createLogger('inversify');

// Service identifiers
export const TYPES = {
  // Core services
  HealthService: Symbol.for('HealthService'),
  HealthMonitor: Symbol.for('HealthMonitor'),
  NotificationManager: Symbol.for('NotificationManager'),
  AlertConfigService: Symbol.for('AlertConfigService'),

  // Existing services
  TranslationService: Symbol.for('TranslationService'),
  PredictiveService: Symbol.for('PredictiveService'),
  TwitterService: Symbol.for('TwitterService'),
  YouTubeService: Symbol.for('YouTubeService'),
  FacebookService: Symbol.for('FacebookService'),
  VideoService: Symbol.for('VideoService'),
  CircuitBreakerService: Symbol.for('CircuitBreakerService'),
  BillingService: Symbol.for('BillingService'),
  AIService: Symbol.for('AIService'),
  SocketService: Symbol.for('SocketService'),
};

const container = new Container();

// Register core services
container.bind(TYPES.HealthService).toSelf().inSingletonScope();
container.bind(TYPES.HealthMonitor).toSelf().inSingletonScope();
container.bind(TYPES.NotificationManager).toSelf().inSingletonScope();
container.bind(TYPES.AlertConfigService).toSelf().inSingletonScope();

// Register existing services (lazy-loaded)
container.bind(TYPES.TranslationService).toSelf().inSingletonScope();
container.bind(TYPES.PredictiveService).toSelf().inSingletonScope();
container.bind(TYPES.TwitterService).toSelf().inSingletonScope();
container.bind(TYPES.YouTubeService).toSelf().inSingletonScope();
container.bind(TYPES.FacebookService).toSelf().inSingletonScope();
container.bind(TYPES.VideoService).toSelf().inSingletonScope();
container.bind(TYPES.CircuitBreakerService).toSelf().inSingletonScope();
container.bind(TYPES.BillingService).toSelf().inSingletonScope();
container.bind(TYPES.AIService).toSelf().inSingletonScope();
container.bind(TYPES.SocketService).toSelf().inSingletonScope();

logger.info('DI container configured');

export { container };
