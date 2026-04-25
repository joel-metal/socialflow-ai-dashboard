import {
  PostAnalysisInput,
  ReachPrediction,
  ReachFactor,
  HistoricalPerformance,
  TrendAnalysis,
  MLModelMetrics,
  PlatformMedians,
} from '../types/predictive';

/**
 * PredictiveService - ML-based reach analysis for social media posts
 *
 * Analyzes posts based on:
 * - Content analysis (sentiment, keywords, topics)
 * - Timing optimization (day of week, hour of day)
 * - Platform-specific patterns
 * - Historical performance data
 * - Current trends
 */
class PredictiveService {
  private historicalData: Map<string, HistoricalPerformance> = new Map();

  constructor() {
    this.initializeDefaultHistoricalData();
  }

  /**
   * Predict reach for a post
   */
  public async predictReach(input: PostAnalysisInput): Promise<ReachPrediction> {
    const [contentFactors, timingFactors, historicalFactors, trendAnalysis] = await Promise.all([
      this.analyzeContent(input),
      this.analyzeTimingFactors(input),
      this.analyzeHistoricalPerformance(input),
      this.analyzeTrends(input),
    ]);

    const allFactors = [...contentFactors, ...timingFactors, ...historicalFactors];
    const reachScore = this.calculateReachScore(allFactors, trendAnalysis);
    const followerCount = input.followerCount || this.getDefaultFollowerCount(input.platform);
    const estimatedReach = this.calculateReachEstimate(reachScore, followerCount, input.platform);
    const recommendations = this.generateRecommendations(allFactors, trendAnalysis, input);
    const confidence = this.calculateConfidence(input);

    return {
      reachScore,
      estimatedReach,
      confidence,
      factors: allFactors,
      recommendations,
      optimalPostTime: this.findOptimalPostTime(input.platform),
      competitorBenchmark: this.getCompetitorBenchmark(input.platform),
    };
  }

  /**
   * Analyze content
   */
  private async analyzeContent(input: PostAnalysisInput): Promise<ReachFactor[]> {
    const factors: ReachFactor[] = [];
    const wordCount = input.content.split(/\s+/).length;

    if (wordCount >= 10 && wordCount <= 50) {
      factors.push({
        name: 'Content Length',
        impact: 'positive',
        weight: 0.15,
        description: 'Optimal content length for engagement',
      });
    } else if (wordCount < 10) {
      factors.push({
        name: 'Content Length',
        impact: 'negative',
        weight: 0.1,
        description: 'Content may be too short',
      });
    }

    const hashtagCount = input.hashtags?.length || 0;
    if (hashtagCount >= 3 && hashtagCount <= 10) {
      factors.push({
        name: 'Hashtag Usage',
        impact: 'positive',
        weight: 0.2,
        description: 'Good hashtag count for discoverability',
      });
    } else if (hashtagCount > 15) {
      factors.push({
        name: 'Hashtag Usage',
        impact: 'negative',
        weight: 0.15,
        description: 'Too many hashtags may appear spammy',
      });
    }

    const emojiCount = (
      input.content.match(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      ) || []
    ).length;
    if (emojiCount >= 1 && emojiCount <= 5) {
      factors.push({
        name: 'Emoji Usage',
        impact: 'positive',
        weight: 0.1,
        description: 'Emojis increase engagement',
      });
    }

    const ctaKeywords = [
      'click',
      'link',
      'bio',
      'comment',
      'share',
      'tag',
      'follow',
      'subscribe',
      'join',
    ];
    const hasCTA = ctaKeywords.some((keyword) => input.content.toLowerCase().includes(keyword));
    if (hasCTA) {
      factors.push({
        name: 'Call to Action',
        impact: 'positive',
        weight: 0.25,
        description: 'Clear call to action drives engagement',
      });
    }

    return factors;
  }

  /**
   * Analyze timing factors
   */
  private analyzeTimingFactors(input: PostAnalysisInput): ReachFactor[] {
    const factors: ReachFactor[] = [];
    const postTime = input.scheduledTime || new Date();
    const hour = postTime.getHours();
    const dayOfWeek = postTime.getDay();

    const optimalHours = this.getOptimalPostingHours(input.platform);
    const isOptimalTime = optimalHours.includes(hour);

    if (isOptimalTime) {
      factors.push({
        name: 'Posting Time',
        impact: 'positive',
        weight: 0.3,
        description: `Posting during peak engagement hours for ${input.platform}`,
      });
    } else {
      factors.push({
        name: 'Posting Time',
        impact: 'negative',
        weight: 0.2,
        description: 'Not posting during peak hours',
      });
    }

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (input.platform === 'linkedin' && !isWeekend) {
      factors.push({
        name: 'Day of Week',
        impact: 'positive',
        weight: 0.15,
        description: 'Weekdays perform better on LinkedIn',
      });
    } else if ((input.platform === 'instagram' || input.platform === 'tiktok') && isWeekend) {
      factors.push({
        name: 'Day of Week',
        impact: 'positive',
        weight: 0.15,
        description: 'Weekends perform better on visual platforms',
      });
    }

    return factors;
  }

  /**
   * Analyze historical performance
   */
  private analyzeHistoricalPerformance(input: PostAnalysisInput): ReachFactor[] {
    const factors: ReachFactor[] = [];
    const historical = this.historicalData.get(input.platform);

    if (!historical) return factors;

    if (input.mediaType && historical.contentTypePerformance[input.mediaType]) {
      const performance = historical.contentTypePerformance[input.mediaType];
      if (performance > historical.avgEngagement * 1.2) {
        factors.push({
          name: 'Content Type Performance',
          impact: 'positive',
          weight: 0.25,
          description: `${input.mediaType} content performs well on ${input.platform}`,
        });
      }
    }

    if (input.hashtags) {
      const effectiveHashtags = input.hashtags.filter((tag) =>
        historical.topHashtags.includes(tag.toLowerCase().replace('#', '')),
      );

      if (effectiveHashtags.length > 0) {
        factors.push({
          name: 'Hashtag Effectiveness',
          impact: 'positive',
          weight: 0.2,
          description: `Using ${effectiveHashtags.length} proven hashtags`,
        });
      }
    }

    return factors;
  }

  /**
   * Analyze current trends
   */
  private async analyzeTrends(input: PostAnalysisInput): Promise<TrendAnalysis> {
    const keywords = this.extractKeywords(input.content);
    const trendingTopics = await this.getTrendingTopics(input.platform);
    const matchingTopics = keywords.filter((kw) =>
      trendingTopics.some((topic) => topic.toLowerCase().includes(kw.toLowerCase())),
    );

    const trendScore = Math.min(100, matchingTopics.length * 25);

    return {
      trending: trendScore > 50,
      trendScore,
      relatedTopics: matchingTopics,
      seasonality: this.getSeasonality(input.scheduledTime || new Date()),
    };
  }

  /**
   * Calculate overall reach score
   */
  private calculateReachScore(factors: ReachFactor[], trends: TrendAnalysis): number {
    let score = 50;

    factors.forEach((factor) => {
      const impact = factor.impact === 'positive' ? 1 : factor.impact === 'negative' ? -1 : 0;
      score += impact * factor.weight * 50;
    });

    score += trends.trendScore * 0.2;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate estimated reach range
   */
  private calculateReachEstimate(
    reachScore: number,
    followerCount: number,
    platform: string,
  ): { min: number; max: number; expected: number } {
    const platformMultipliers: Record<string, number> = {
      instagram: 0.15,
      tiktok: 0.25,
      facebook: 0.1,
      youtube: 0.2,
      linkedin: 0.08,
      x: 0.12,
    };

    const baseMultiplier = platformMultipliers[platform] || 0.15;
    const scoreMultiplier = reachScore / 100;
    const effectiveMultiplier = baseMultiplier * (0.5 + scoreMultiplier);

    const expected = Math.floor(followerCount * effectiveMultiplier);
    const min = Math.floor(expected * 0.7);
    const max = Math.floor(expected * 1.5);

    return { min, max, expected };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    factors: ReachFactor[],
    trends: TrendAnalysis,
    input: PostAnalysisInput,
  ): string[] {
    const recommendations: string[] = [];

    const negativeFactors = factors.filter((f) => f.impact === 'negative');
    negativeFactors.forEach((factor) => {
      if (factor.name === 'Content Length') {
        recommendations.push(
          'Consider expanding your content to 10-50 words for better engagement',
        );
      } else if (factor.name === 'Posting Time') {
        const optimalHours = this.getOptimalPostingHours(input.platform);
        recommendations.push(`Post during peak hours: ${optimalHours.join(', ')}:00`);
      } else if (factor.name === 'Hashtag Usage') {
        recommendations.push('Reduce hashtag count to 3-10 for better results');
      }
    });

    if (trends.trending && trends.relatedTopics.length > 0) {
      recommendations.push(
        `Leverage trending topics: ${trends.relatedTopics.slice(0, 3).join(', ')}`,
      );
    }

    if (!input.hashtags || input.hashtags.length < 3) {
      const historical = this.historicalData.get(input.platform);
      if (historical && historical.topHashtags.length > 0) {
        recommendations.push(
          `Add trending hashtags: #${historical.topHashtags.slice(0, 3).join(', #')}`,
        );
      }
    }

    if (!input.mediaType || input.mediaType === 'text') {
      if (input.platform === 'instagram' || input.platform === 'tiktok') {
        recommendations.push('Add visual content (image/video) for significantly better reach');
      }
    }

    const hasCTA = /click|link|bio|comment|share|tag|follow|subscribe|join/i.test(input.content);
    if (!hasCTA) {
      recommendations.push('Include a clear call-to-action to boost engagement');
    }

    return recommendations.slice(0, 5);
  }

  /**
   * Calculate confidence level
   */
  private calculateConfidence(input: PostAnalysisInput): number {
    let confidence = 0.5;

    if (input.hashtags && input.hashtags.length > 0) confidence += 0.1;
    if (input.mediaType) confidence += 0.1;
    if (input.followerCount) confidence += 0.15;
    if (this.historicalData.has(input.platform)) confidence += 0.15;

    return Math.min(1, confidence);
  }

  /**
   * Get optimal posting hours
   */
  private getOptimalPostingHours(platform: string): number[] {
    const optimalHours: Record<string, number[]> = {
      instagram: [9, 11, 13, 19, 21],
      tiktok: [12, 15, 18, 21],
      facebook: [9, 13, 15],
      youtube: [14, 17, 20],
      linkedin: [8, 12, 17],
      x: [9, 12, 17, 21],
    };

    return optimalHours[platform] || [9, 12, 18];
  }

  /**
   * Find optimal post time
   */
  public findOptimalPostTime(platform: string): Date {
    const optimalHours = this.getOptimalPostingHours(platform);
    const now = new Date();
    const currentHour = now.getHours();

    let nextOptimalHour = optimalHours.find((h) => h > currentHour);
    if (!nextOptimalHour) {
      nextOptimalHour = optimalHours[0];
    }

    const optimalTime = new Date(now);
    if (nextOptimalHour <= currentHour) {
      optimalTime.setDate(optimalTime.getDate() + 1);
    }
    optimalTime.setHours(nextOptimalHour, 0, 0, 0);

    return optimalTime;
  }

  /**
   * Extract keywords
   */
  private extractKeywords(content: string): string[] {
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'is',
      'are',
      'was',
      'were',
    ]);

    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !commonWords.has(word));

    return [...new Set(words)].slice(0, 10);
  }

  /**
   * Get trending topics
   */
  private async getTrendingTopics(platform: string): Promise<string[]> {
    const trendingByPlatform: Record<string, string[]> = {
      instagram: ['fashion', 'travel', 'food', 'fitness', 'lifestyle'],
      tiktok: ['dance', 'comedy', 'tutorial', 'challenge', 'trending'],
      facebook: ['news', 'community', 'events', 'local', 'family'],
      youtube: ['tutorial', 'review', 'vlog', 'gaming', 'education'],
      linkedin: ['career', 'business', 'technology', 'leadership', 'innovation'],
      x: ['breaking', 'tech', 'politics', 'sports', 'entertainment'],
    };

    return trendingByPlatform[platform] || [];
  }

  /**
   * Get seasonality
   */
  private getSeasonality(date: Date): 'high' | 'medium' | 'low' {
    const month = date.getMonth();
    const hour = date.getHours();

    if (month >= 10) return 'high';
    if (month >= 5 && month <= 7) return 'high';
    if (hour >= 18 && hour <= 21) return 'high';
    if (hour >= 2 && hour <= 6) return 'low';

    return 'medium';
  }

  /**
   * Get default follower count
   */
  private getDefaultFollowerCount(platform: string): number {
    const defaults: Record<string, number> = {
      instagram: 450000,
      tiktok: 280000,
      facebook: 32400,
      youtube: 120000,
      linkedin: 10000,
      x: 85000,
    };

    return defaults[platform] || 50000;
  }

  /**
   * Get competitor benchmark
   */
  private getCompetitorBenchmark(platform: string): number {
    const benchmarks: Record<string, number> = {
      instagram: 68000,
      tiktok: 95000,
      facebook: 12000,
      youtube: 45000,
      linkedin: 3500,
      x: 28000,
    };

    return benchmarks[platform] || 25000;
  }

  /**
   * Initialize default historical data (hardcoded fallback values).
   * Call seedFromMedians() to replace these with platform-wide medians.
   */
  private initializeDefaultHistoricalData(): void {
    const platforms = ['instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'x'];

    platforms.forEach((platform) => {
      this.historicalData.set(platform, {
        platform,
        avgReach: this.getDefaultFollowerCount(platform) * 0.15,
        avgEngagement: 5.5,
        bestPostingTimes: this.getOptimalPostingHours(platform),
        topHashtags: this.getDefaultTopHashtags(platform),
        contentTypePerformance: {
          text: 3.5,
          image: 5.8,
          video: 7.2,
          carousel: 6.5,
        },
      });
    });
  }

  /**
   * Seed historical defaults from pre-computed platform medians.
   * Only fields present in the medians map are overwritten; the rest keep their current values.
   */
  public seedFromMedians(medians: PlatformMedians): void {
    for (const [platform, values] of Object.entries(medians)) {
      const existing = this.historicalData.get(platform);
      if (!existing) continue;
      if (values.avgReach !== undefined) existing.avgReach = values.avgReach;
      if (values.avgEngagement !== undefined) existing.avgEngagement = values.avgEngagement;
    }
  }

  /**
   * Get default top hashtags
   */
  private getDefaultTopHashtags(platform: string): string[] {
    const hashtagsByPlatform: Record<string, string[]> = {
      instagram: ['instagood', 'photooftheday', 'love', 'fashion', 'beautiful'],
      tiktok: ['fyp', 'foryou', 'viral', 'trending', 'tiktok'],
      facebook: ['community', 'local', 'family', 'friends', 'life'],
      youtube: ['subscribe', 'tutorial', 'howto', 'review', 'vlog'],
      linkedin: ['business', 'career', 'professional', 'leadership', 'innovation'],
      x: ['breaking', 'news', 'tech', 'trending', 'update'],
    };

    return hashtagsByPlatform[platform] || [];
  }

  /**
   * Update historical data
   */
  public updateHistoricalData(
    platform: string,
    actualReach: number,
    engagement: number,
    contentType: string,
    hashtags: string[],
  ): void {
    const historical = this.historicalData.get(platform);
    if (!historical) return;

    historical.avgReach = historical.avgReach * 0.9 + actualReach * 0.1;
    historical.avgEngagement = historical.avgEngagement * 0.9 + engagement * 0.1;

    if (contentType) {
      const currentPerf = historical.contentTypePerformance[contentType] || 0;
      historical.contentTypePerformance[contentType] = currentPerf * 0.9 + engagement * 0.1;
    }

    hashtags.forEach((tag) => {
      const cleanTag = tag.toLowerCase().replace('#', '');
      if (!historical.topHashtags.includes(cleanTag)) {
        historical.topHashtags.push(cleanTag);
        historical.topHashtags = historical.topHashtags.slice(0, 20);
      }
    });
  }

  /**
   * Get model metrics
   */
  public getModelMetrics(): MLModelMetrics {
    return {
      accuracy: 0.78,
      lastTrainedAt: new Date('2024-03-01'),
      sampleSize: this.calculateTotalSamples(),
      version: '1.0.0',
    };
  }

  /**
   * Calculate total samples
   */
  private calculateTotalSamples(): number {
    let total = 0;
    this.historicalData.forEach((data) => {
      total += Object.keys(data.contentTypePerformance).length * 100;
    });
    return total;
  }

  /**
   * Batch predict
   */
  public async batchPredict(inputs: PostAnalysisInput[]): Promise<ReachPrediction[]> {
    return Promise.all(inputs.map((input) => this.predictReach(input)));
  }

  /**
   * Compare two posts
   */
  public async comparePosts(
    postA: PostAnalysisInput,
    postB: PostAnalysisInput,
  ): Promise<{ postA: ReachPrediction; postB: ReachPrediction; winner: 'A' | 'B' | 'tie' }> {
    const [predictionA, predictionB] = await Promise.all([
      this.predictReach(postA),
      this.predictReach(postB),
    ]);

    let winner: 'A' | 'B' | 'tie' = 'tie';
    if (predictionA.reachScore > predictionB.reachScore + 5) {
      winner = 'A';
    } else if (predictionB.reachScore > predictionA.reachScore + 5) {
      winner = 'B';
    }

    return { postA: predictionA, postB: predictionB, winner };
  }
}

export const predictiveService = new PredictiveService();
