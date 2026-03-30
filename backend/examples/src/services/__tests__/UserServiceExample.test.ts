import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '../config/inversify.config';
import { UserServiceExample } from '../services/UserServiceExample';
import { HealthService } from '../services/healthService';
import { NotificationManager } from '../services/notificationProvider';

/**
 * Example: Testing with InversifyJS DI
 *
 * This demonstrates how to:
 * 1. Create a test container
 * 2. Mock dependencies
 * 3. Bind mocks to the container
 * 4. Test the service with mocked dependencies
 */

describe('UserServiceExample with DI', () => {
  let container: Container;
  let userService: UserServiceExample;
  let mockHealthService: jest.Mocked<HealthService>;
  let mockNotificationManager: jest.Mocked<NotificationManager>;

  beforeEach(() => {
    // Create a new container for each test
    container = new Container();

    // Create mocks
    mockHealthService = {
      getSystemStatus: jest.fn().mockResolvedValue({
        dependencies: {},
        overallStatus: 'healthy',
      }),
      checkDatabase: jest.fn(),
      checkRedis: jest.fn(),
      checkS3: jest.fn(),
      checkTwitterAPI: jest.fn(),
      setHealthMonitor: jest.fn(),
    } as any;

    mockNotificationManager = {
      sendAlert: jest.fn().mockResolvedValue(undefined),
      registerProvider: jest.fn(),
    } as any;

    // Bind mocks to container
    container.bind(TYPES.HealthService).toConstantValue(mockHealthService);
    container.bind(TYPES.NotificationManager).toConstantValue(mockNotificationManager);

    // Bind the service to test
    container.bind(TYPES.UserService).to(UserServiceExample);

    // Get the service instance
    userService = container.get<UserServiceExample>(TYPES.UserService);
  });

  describe('getUser', () => {
    it('should get user successfully', async () => {
      const user = await userService.getUser('123');

      expect(user).toEqual({
        id: '123',
        name: 'Example User',
        email: 'user@example.com',
      });
      expect(mockHealthService.getSystemStatus).toHaveBeenCalled();
    });

    it('should send alert when system is unhealthy', async () => {
      mockHealthService.getSystemStatus.mockResolvedValueOnce({
        dependencies: {},
        overallStatus: 'unhealthy',
      });

      const _user = await userService.getUser('123');

      expect(mockNotificationManager.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'warning',
          service: 'user-service',
          message: expect.stringContaining('unhealthy'),
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      mockHealthService.getSystemStatus.mockRejectedValueOnce(new Error('Health check failed'));

      await expect(userService.getUser('123')).rejects.toThrow('Health check failed');
    });
  });

  describe('createUser', () => {
    it('should create user successfully', async () => {
      const userData = { name: 'John Doe', email: 'john@example.com' };
      const user = await userService.createUser(userData);

      expect(user).toEqual({
        id: '123',
        ...userData,
      });
      expect(mockNotificationManager.sendAlert).toHaveBeenCalled();
    });

    it('should notify on user creation', async () => {
      const userData = { name: 'Jane Doe', email: 'jane@example.com' };
      await userService.createUser(userData);

      expect(mockNotificationManager.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'warning',
          service: 'user-service',
          message: expect.stringContaining('jane@example.com'),
        }),
      );
    });
  });
});

/**
 * Key Testing Patterns:
 *
 * 1. Create a new Container for each test
 * 2. Create mock implementations of dependencies
 * 3. Bind mocks using toConstantValue()
 * 4. Get the service from the container
 * 5. Test the service with mocked dependencies
 *
 * Benefits:
 * - Easy to mock dependencies
 * - No need to modify service code for testing
 * - Can test different scenarios with different mocks
 * - Isolated unit tests
 */
