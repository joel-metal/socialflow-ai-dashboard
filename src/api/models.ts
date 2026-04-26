// Auto-generated from backend/openapi.yaml — do not edit manually.
// Run `npm run generate-client` to regenerate.

export type WebhookEventType =
  | 'post.published'
  | 'post.failed'
  | 'analytics.report_ready'
  | 'blockchain.transaction_completed'
  | 'blockchain.transaction_failed'
  | 'system.health_check';

export type Credentials = {
  email: string;
  password: string;
};

export type RefreshTokenRequest = {
  refreshToken: string;
};

export type AuthTokens = {
  accessToken?: string;
  refreshToken?: string;
};

export type WebhookSubscription = {
  id?: string;
  url?: string;
  events?: WebhookEventType[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateWebhookRequest = {
  url: string;
  secret: string;
  events: WebhookEventType[];
};

export type UpdateWebhookRequest = {
  url?: string;
  secret?: string;
  events?: WebhookEventType[];
  isActive?: boolean;
};

export type WebhookDelivery = {
  id?: string;
  eventType?: WebhookEventType;
  status?: 'pending' | 'success' | 'failed';
  attempts?: number;
  responseStatus?: number | null;
  errorMessage?: string | null;
  createdAt?: string;
  nextRetryAt?: string | null;
};

export type VideoJob = {
  jobId?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  inputPath?: string;
  outputPath?: string | null;
  error?: string | null;
  createdAt?: string;
};

export type TranslationRequest = {
  text: string;
  sourceLanguage?: string;
  targetLanguages: string[];
  preserveFormatting?: boolean;
  preserveHashtags?: boolean;
  preserveMentions?: boolean;
  preserveUrls?: boolean;
  preserveEmojis?: boolean;
};

export type TranslationResult = {
  sourceLanguage?: string;
  translations?: Record<string, string>;
};

export type Language = {
  code?: string;
  name?: string;
};

export type CircuitBreakerStats = {
  state?: 'closed' | 'open' | 'half-open';
  failures?: number;
  successes?: number;
  lastFailureTime?: string | null;
};

export type HealthStatus = {
  status?: 'healthy' | 'degraded' | 'unhealthy';
  timestamp?: string;
};

export type SystemStatus = {
  overallStatus?: 'healthy' | 'degraded' | 'unhealthy';
  services?: Record<string, HealthStatus>;
};

export type AnalyzeImageRequest = {
  /** Base64-encoded image data or public image URL */
  imageData: string;
  mimeType?: string;
  context?: string;
};

export type AnalyticsFilters = {
  platform?: 'twitter' | 'linkedin' | 'instagram' | 'tiktok' | null;
  from?: number | null;
  to?: number | null;
};

export type ConfigUpdateRequest = {
  value: unknown;
  type?: string;
  description?: string;
};

export type ErrorResponse = {
  message?: string;
  error?: string;
  code?: string;
};
