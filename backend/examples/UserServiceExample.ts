import 'reflect-metadata';
import { injectable, inject } from 'inversify';
import { TYPES } from '../config/inversify.config';
import { HealthService } from './healthService';
import { NotificationManager } from './notificationProvider';
import { createLogger } from '../lib/logger';

const logger = createLogger('userServiceExample');

/**
 * Example: UserService refactored with InversifyJS
 *
 * This demonstrates how to:
 * 1. Add @injectable() decorator
 * 2. Inject dependencies via constructor
 * 3. Use @inject(TYPES.ServiceName) for each dependency
 */
@injectable()
export class UserServiceExample {
  constructor(
    @inject(TYPES.HealthService) private healthService: HealthService,
    @inject(TYPES.NotificationManager) private notificationManager: NotificationManager,
  ) {
    logger.info('UserServiceExample initialized with DI');
  }

  async getUser(id: string) {
    try {
      // Check system health before operation
      const status = await this.healthService.getSystemStatus();

      if (status.overallStatus === 'unhealthy') {
        await this.notificationManager.sendAlert({
          severity: 'warning',
          service: 'user-service',
          message: `System unhealthy, user fetch may be delayed`,
          timestamp: new Date().toISOString(),
        });
      }

      // Simulate user fetch
      return {
        id,
        name: 'Example User',
        email: 'user@example.com',
      };
    } catch (error) {
      logger.error('Failed to get user', {
        error: error instanceof Error ? error.message : String(error),
        userId: id,
      });
      throw error;
    }
  }

  async createUser(data: { name: string; email: string }) {
    try {
      logger.info('Creating user', { email: data.email });

      // Simulate user creation
      const user = {
        id: '123',
        ...data,
      };

      // Notify on success
      await this.notificationManager.sendAlert({
        severity: 'warning',
        service: 'user-service',
        message: `User created: ${data.email}`,
        timestamp: new Date().toISOString(),
      });

      return user;
    } catch (error) {
      logger.error('Failed to create user', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * Usage Example:
 *
 * // Option 1: Via service factory
 * import { container, TYPES } from '../config/inversify.config';
 * const userService = container.get<UserServiceExample>(TYPES.UserService);
 *
 * // Option 2: Via factory function
 * import { getUserService } from '../services/serviceFactory';
 * const userService = getUserService();
 *
 * // Use the service
 * const user = await userService.getUser('123');
 */
