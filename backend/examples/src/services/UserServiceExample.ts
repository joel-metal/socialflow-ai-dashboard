import 'reflect-metadata';
import { injectable, inject } from 'inversify';
import { HealthService } from './healthService';
import { NotificationManager } from './notificationProvider';
import { TYPES } from '../config/types';

export interface User {
  id: string;
  name: string;
  email: string;
}

@injectable()
export class UserServiceExample {
  constructor(
    @inject(TYPES.HealthService) private healthService: HealthService,
    @inject(TYPES.NotificationManager) private notificationManager: NotificationManager,
  ) {}

  async getUser(id: string): Promise<User> {
    const status = await this.healthService.getSystemStatus();
    if (status.overallStatus === 'unhealthy') {
      await this.notificationManager.sendAlert({
        severity: 'warning',
        service: 'user-service',
        message: `System is unhealthy while fetching user ${id}`,
        timestamp: new Date().toISOString(),
      });
    }
    return { id, name: 'Example User', email: 'user@example.com' };
  }

  async createUser(data: { name: string; email: string }): Promise<User> {
    const user: User = { id: '123', ...data };
    await this.notificationManager.sendAlert({
      severity: 'warning',
      service: 'user-service',
      message: `New user created: ${data.email}`,
      timestamp: new Date().toISOString(),
    });
    return user;
  }
}
