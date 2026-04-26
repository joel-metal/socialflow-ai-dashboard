export interface PostAnalysisInput {
  content: string;
  platform: 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'linkedin' | 'x';
  scheduledTime?: Date;
  hashtags?: string[];
  mentions?: string[];
  mediaType?: 'text' | 'image' | 'video' | 'carousel';
  followerCount?: number;
}

export interface ReachPrediction {
  reachScore: number;
  estimatedReach: {
    min: number;
    max: number;
    expected: number;
  };
  confidence: number;
  factors: ReachFactor[];
  recommendations: string[];
  optimalPostTime?: Date;
  competitorBenchmark?: number;
}

export interface ReachFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  description: string;
}

export interface HistoricalPerformance {
  platform: string;
  avgReach: number;
  avgEngagement: number;
  bestPostingTimes: number[];
  topHashtags: string[];
  contentTypePerformance: Record<string, number>;
}

export interface TrendAnalysis {
  trending: boolean;
  trendScore: number;
  relatedTopics: string[];
  seasonality: 'high' | 'medium' | 'low';
}

export interface MLModelMetrics {
  accuracy: number;
  lastTrainedAt: Date;
  sampleSize: number;
  version: string;
}
