import 'reflect-metadata';
import { Container } from 'inversify';
import { createLogger } from '../lib/logger';
import { HealthService } from '../services/healthService';
import { HealthMonitor } from '../services/healthMonitor';
import { NotificationManager } from '../services/notificationProvider';
import { AlertConfigService } from '../services/alertConfigService';
import { CircuitBreakerService } from '../services/CircuitBreakerService';
import { AIService } from '../services/AIService';

export { TYPES } from './types';
import { TYPES } from './types';

const logger = createLogger('inversify');

const container = new Container();

container.bind<AlertConfigService>(TYPES.AlertConfigService).to(AlertConfigService).inSingletonScope();
container.bind<NotificationManager>(TYPES.NotificationManager).to(NotificationManager).inSingletonScope();
container.bind<HealthMonitor>(TYPES.HealthMonitor).to(HealthMonitor).inSingletonScope();
container.bind<HealthService>(TYPES.HealthService).to(HealthService).inSingletonScope();
container.bind<CircuitBreakerService>(TYPES.CircuitBreakerService).to(CircuitBreakerService).inSingletonScope();
container.bind<AIService>(TYPES.AIService).to(AIService).inSingletonScope();

logger.info('DI container configured');

export { container };
