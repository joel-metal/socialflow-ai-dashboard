// Service identifier tokens — no imports from other local modules to avoid circular deps
export const TYPES = {
  HealthService: Symbol.for('HealthService'),
  HealthMonitor: Symbol.for('HealthMonitor'),
  NotificationManager: Symbol.for('NotificationManager'),
  AlertConfigService: Symbol.for('AlertConfigService'),
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
  UserService: Symbol.for('UserService'),
};
