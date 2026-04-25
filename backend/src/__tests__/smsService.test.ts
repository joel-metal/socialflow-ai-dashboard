import { SmsService } from '../services/smsService';

// Mock Twilio
jest.mock('twilio', () => {
  return jest.fn().mockImplementation((accountSid, authToken) => {
    if (accountSid === 'test_sid' && authToken === 'test_token') {
      return {
        messages: {
          create: jest.fn().mockResolvedValue({
            sid: 'SM123456789',
            status: 'queued',
          }),
        },
      };
    }
    throw new Error('Invalid credentials');
  });
});

describe('SmsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with valid credentials', () => {
    it('should initialize successfully with valid Twilio credentials', () => {
      const service = new SmsService({
        accountSid: 'test_sid',
        authToken: 'test_token',
        fromNumber: '+15551234567',
      });

      expect(service.isEnabled()).toBe(true);
    });

    it('should send SMS successfully', async () => {
      const service = new SmsService({
        accountSid: 'test_sid',
        authToken: 'test_token',
        fromNumber: '+15551234567',
      });

      const result = await service.send('+15559876543', 'Test message');

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('SM123456789');
      expect(result.error).toBeUndefined();
    });

    it('should handle Twilio API errors gracefully', async () => {
      const twilio = require('twilio');
      twilio.mockImplementationOnce(() => ({
        messages: {
          create: jest.fn().mockRejectedValue(new Error('Invalid phone number')),
        },
      }));

      const service = new SmsService({
        accountSid: 'test_sid',
        authToken: 'test_token',
        fromNumber: '+15551234567',
      });

      const result = await service.send('invalid', 'Test message');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid phone number');
      expect(result.messageId).toBeUndefined();
    });
  });

  describe('with missing credentials', () => {
    it('should be disabled when accountSid is missing', () => {
      const service = new SmsService({
        authToken: 'test_token',
        fromNumber: '+15551234567',
      });

      expect(service.isEnabled()).toBe(false);
    });

    it('should be disabled when authToken is missing', () => {
      const service = new SmsService({
        accountSid: 'test_sid',
        fromNumber: '+15551234567',
      });

      expect(service.isEnabled()).toBe(false);
    });

    it('should be disabled when fromNumber is missing', () => {
      const service = new SmsService({
        accountSid: 'test_sid',
        authToken: 'test_token',
      });

      expect(service.isEnabled()).toBe(false);
    });

    it('should return error when sending SMS with disabled service', async () => {
      const service = new SmsService({});

      const result = await service.send('+15559876543', 'Test message');

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMS service not configured');
      expect(result.messageId).toBeUndefined();
    });
  });

  describe('degraded behavior', () => {
    it('should gracefully degrade when Twilio SDK is not available', () => {
      jest.doMock('twilio', () => {
        throw new Error('Module not found');
      });

      const service = new SmsService({
        accountSid: 'test_sid',
        authToken: 'test_token',
        fromNumber: '+15551234567',
      });

      expect(service.isEnabled()).toBe(false);
    });
  });
});
