/**
 * Service Index
 * 
 * Central export point for all service modules.
 * Provides clean imports and factory functions.
 * 
 */

// ============================================
// Twitter Services
// ============================================

export { TwitterService, createTwitterService } from './TwitterService';
export type {
  TwitterConfig,
  TwitterUser,
  Tweet,
  TweetResponse,
  TimelineResponse,
  MentionsResponse,
  OAuthTokens,
  PKCEChallenge,
} from './TwitterService';

export { TweetSchedulerService, createTweetSchedulerService } from './TweetSchedulerService';
export type {
  ScheduledTweet,
  ScheduleOptions,
  RecurringSchedule,
  OptimalTimeResult,
  SchedulerConfig,
} from './TweetSchedulerService';

// ============================================
// AI Services
// ============================================

export { AIService, createAIService, generateCaption, generateReply, usageLogger } from './AIService';
export type {
  AIProvider,
  AIConfig,
  GenerationOptions,
  GeneratedContent,
  StreamingCallback,
  PromptTemplate,
} from './AIService';

export { DEFAULT_PROMPT_TEMPLATES } from './AIService';

// ============================================
// Storage Services
// ============================================

export { StorageService, createStorageService, uploadImage } from './StorageService';
export type {
  StorageProvider,
  StorageConfig,
  UploadOptions,
  ImageTransformation,
  UploadResult,
  UploadProgress,
  ProgressCallback,
} from './StorageService';

// ============================================
// Email Services
// ============================================

export { EmailService, createEmailService } from './EmailService';
export type {
  EmailProvider,
  EmailConfig,
  EmailRecipient,
  EmailData,
  EmailAttachment,
  EmailResult,
  EmailQueueJob,
  EmailTemplate,
} from './EmailService';

export { EMAIL_TEMPLATES } from './EmailService';

// ============================================
// Utility Exports
// ============================================

// Re-export commonly used services
export { identityService } from './IndetificationService';
export { blockchainService } from './BlockchainService';
