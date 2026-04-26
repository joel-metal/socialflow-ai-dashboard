/**
 * Tweet Scheduler Service
 * 
 * Service for scheduling and managing tweet posts with automatic retry logic.
 * Supports recurring schedules, queuing, and publishing at optimal times.
 * 
 */

import { TwitterService, TweetResponse } from './TwitterService';

// ============================================
// Type Definitions
// ============================================

export interface ScheduledTweet {
  id: string;
  text: string;
  scheduledAt: Date;
  status: 'pending' | 'queued' | 'published' | 'failed' | 'cancelled';
  mediaIds?: string[];
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  publishedAt?: Date;
  error?: string;
}

export interface ScheduleOptions {
  scheduleAt: Date;
  text: string;
  mediaIds?: string[];
  maxRetries?: number;
  recurring?: RecurringSchedule;
}

export interface RecurringSchedule {
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  endDate?: Date;
  maxOccurrences?: number;
}

export interface OptimalTimeResult {
  bestTimes: Date[];
  timezone: string;
}

export interface SchedulerConfig {
  twitterService: TwitterService;
  defaultMaxRetries: number;
  checkIntervalMs: number;
}

// ============================================
// Tweet Scheduler
// ============================================

export class TweetSchedulerService {
  private config: SchedulerConfig;
  private scheduledTweets: Map<string, ScheduledTweet> = new Map();
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: SchedulerConfig) {
    this.config = config;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.intervalId) {
      console.log('[TweetScheduler] Already running');
      return;
    }

    console.log('[TweetScheduler] Starting scheduler...');
    this.intervalId = setInterval(() => {
      this.processScheduledTweets();
    }, this.config.checkIntervalMs);

    // Run immediately on start
    this.processScheduledTweets();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[TweetScheduler] Stopped scheduler');
    }
  }

  /**
   * Schedule a tweet for future publishing
   */
  async scheduleTweet(options: ScheduleOptions): Promise<string> {
    const tweet: ScheduledTweet = {
      id: `tweet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: options.text,
      scheduledAt: options.scheduleAt,
      status: 'pending',
      mediaIds: options.mediaIds,
      retryCount: 0,
      maxRetries: options.maxRetries || this.config.defaultMaxRetries,
      createdAt: new Date(),
    };

    this.scheduledTweets.set(tweet.id, tweet);
    console.log(`[TweetScheduler] Scheduled tweet ${tweet.id} for ${options.scheduleAt.toISOString()}`);

    return tweet.id;
  }

  /**
   * Cancel a scheduled tweet
   */
  cancelTweet(tweetId: string): boolean {
    const tweet = this.scheduledTweets.get(tweetId);
    if (!tweet) {
      return false;
    }

    if (tweet.status === 'published') {
      console.log(`[TweetScheduler] Cannot cancel published tweet ${tweetId}`);
      return false;
    }

    tweet.status = 'cancelled';
    console.log(`[TweetScheduler] Cancelled tweet ${tweetId}`);
    return true;
  }

  /**
   * Get scheduled tweet by ID
   */
  getScheduledTweet(tweetId: string): ScheduledTweet | undefined {
    return this.scheduledTweets.get(tweetId);
  }

  /**
   * Get all scheduled tweets
   */
  getAllScheduledTweets(): ScheduledTweet[] {
    return Array.from(this.scheduledTweets.values());
  }

  /**
   * Get pending tweets
   */
  getPendingTweets(): ScheduledTweet[] {
    return Array.from(this.scheduledTweets.values())
      .filter(t => t.status === 'pending' || t.status === 'queued');
  }

  /**
   * Get optimal posting times (mock implementation)
   */
  getOptimalPostingTimes(date: Date, count: number = 3): OptimalTimeResult {
    const bestTimes: Date[] = [];
    const baseDate = new Date(date);
    baseDate.setHours(9, 0, 0, 0); // Start at 9 AM

    // Simple algorithm: suggest morning and evening times
    const hours = [9, 12, 17, 20]; // 9 AM, 12 PM, 5 PM, 8 PM
    
    for (let i = 0; i < count; i++) {
      const suggestion = new Date(baseDate);
      suggestion.setHours(hours[i % hours.length]);
      suggestion.setDate(suggestion.getDate() + Math.floor(i / hours.length));
      bestTimes.push(suggestion);
    }

    return {
      bestTimes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /**
   * Create a recurring schedule
   */
  createRecurringSchedule(options: ScheduleOptions): string[] {
    if (!options.recurring) {
      throw new Error('Recurring schedule options required');
    }

    const tweetIds: string[] = [];
    const { frequency, endDate, maxOccurrences } = options.recurring;
    const scheduleAt = new Date(options.scheduleAt);
    let occurrences = 0;
    const max = maxOccurrences || 52; // Default max 52 occurrences

    while (occurrences < max) {
      const tweet: ScheduledTweet = {
        id: `tweet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: options.text,
        scheduledAt: new Date(scheduleAt),
        status: 'pending',
        mediaIds: options.mediaIds,
        retryCount: 0,
        maxRetries: options.maxRetries || this.config.defaultMaxRetries,
        createdAt: new Date(),
      };

      this.scheduledTweets.set(tweet.id, tweet);
      tweetIds.push(tweet.id);

      // Calculate next occurrence
      switch (frequency) {
        case 'hourly':
          scheduleAt.setHours(scheduleAt.getHours() + 1);
          break;
        case 'daily':
          scheduleAt.setDate(scheduleAt.getDate() + 1);
          break;
        case 'weekly':
          scheduleAt.setDate(scheduleAt.getDate() + 7);
          break;
        case 'monthly':
          scheduleAt.setMonth(scheduleAt.getMonth() + 1);
          break;
      }

      if (endDate && scheduleAt > endDate) {
        break;
      }

      occurrences++;
    }

    console.log(`[TweetScheduler] Created ${tweetIds.length} recurring tweets`);
    return tweetIds;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async processScheduledTweets(): Promise<void> {
    const now = new Date();
    const pendingTweets = this.getPendingTweets();

    for (const tweet of pendingTweets) {
      if (tweet.scheduledAt <= now) {
        await this.publishTweet(tweet);
      }
    }
  }

  private async publishTweet(tweet: ScheduledTweet): Promise<void> {
    tweet.status = 'queued';
    console.log(`[TweetScheduler] Publishing tweet ${tweet.id}`);

    try {
      let result: TweetResponse;

      if (tweet.mediaIds && tweet.mediaIds.length > 0) {
        result = await this.config.twitterService.postTweetWithMedia(
          tweet.text,
          tweet.mediaIds
        );
      } else {
        result = await this.config.twitterService.postTweet(tweet.text);
      }

      tweet.status = 'published';
      tweet.publishedAt = new Date();
      console.log(`[TweetScheduler] Published tweet ${tweet.id}: ${result.data.id}`);
    } catch (error) {
      tweet.retryCount++;
      
      if (tweet.retryCount >= tweet.maxRetries) {
        tweet.status = 'failed';
        tweet.error = (error as Error).message;
        console.error(`[TweetScheduler] Failed to publish tweet ${tweet.id}:`, error);
      } else {
        tweet.status = 'pending';
        // Reschedule for retry in 5 minutes
        tweet.scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
        console.log(`[TweetScheduler] Retrying tweet ${tweet.id} in 5 minutes`);
      }
    }
  }
}

// ============================================
// Factory Functions
// ============================================

export const createTweetSchedulerService = (
  config: SchedulerConfig
): TweetSchedulerService => {
  return new TweetSchedulerService(config);
};

// Default export
export default TweetSchedulerService;
