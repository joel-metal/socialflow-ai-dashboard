import { GoogleGenerativeAI } from '@google/genai';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { circuitBreakerService } from './CircuitBreakerService';
import { eventBus } from '../lib/eventBus';
import { createLogger } from '../lib/logger';

const logger = createLogger('ai-service');

const tracer = trace.getTracer('socialflow-ai');

/**
 * AIService - Wrapper for Google Gemini AI with circuit breaker protection
 *
 * Provides resilient AI operations with automatic failure handling
 * and fallback strategies.
 */
class AIService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    this.initializeAI();
  }

  /**
   * Initialize Google Gemini AI
   */
  private initializeAI(): void {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== 'your_gemini_api_key_here') {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      } catch (error) {
        logger.warn('Failed to initialize Gemini AI', { service: 'ai', error: (error as Error).message });
      }
    }
  }

  /**
   * Check if AI is available
   */
  public isAvailable(): boolean {
    return this.model !== null;
  }

  /**
   * Generate content with circuit breaker protection and distributed tracing.
   * Pass userId to stream progress via SSE.
   */
  public async generateContent(
    prompt: string,
    fallbackResponse?: string,
    userId?: string,
  ): Promise<string> {
    if (!this.model) {
      throw new Error('Gemini AI not initialized. Please configure API_KEY.');
    }

    const jobId = `ai-${Date.now()}`;
    const span = tracer.startSpan('ai.generateContent', {
      attributes: {
        'ai.provider': 'gemini',
        'ai.model': 'gemini-pro',
        'ai.prompt_length': prompt.length,
      },
    });

    if (userId) {
      eventBus.emitJobProgress({
        jobId,
        userId,
        type: 'ai_generation',
        status: 'processing',
        progress: 0,
        message: 'Generating content…',
      });
    }

    try {
      const result = await circuitBreakerService.execute(
        'ai',
        async () => {
          const res = await this.model.generateContent(prompt);
          const response = await res.response;
          const text = response.text();

          if (!text) throw new Error('Empty response from Gemini AI');

          span.setAttribute('ai.response_length', text.length);
          return text;
        },
        async () => {
          if (fallbackResponse) {
            logger.warn('Circuit breaker open, using fallback response', { service: 'ai', state: 'open' });
            span.setAttribute('ai.fallback', true);
            return fallbackResponse;
          }
          throw new Error('AI service temporarily unavailable. Please try again later.');
        },
      );

      if (userId) {
        eventBus.emitJobProgress({
          jobId,
          userId,
          type: 'ai_generation',
          status: 'completed',
          progress: 100,
          message: 'Done',
        });
      }
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      if (userId) {
        eventBus.emitJobProgress({
          jobId,
          userId,
          type: 'ai_generation',
          status: 'failed',
          progress: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  }

  /**
   * Generate caption for social media
   */
  public async generateCaption(
    topic: string,
    platform: string,
    tone: string = 'professional',
  ): Promise<string> {
    const prompt = `Write a ${tone} social media caption for ${platform} about: "${topic}". Include relevant hashtags. Keep it engaging and concise.`;

    const fallback = `Check out our latest update about ${topic}! #${platform} #update`;

    return this.generateContent(prompt, fallback);
  }

  /**
   * Generate reply suggestions
   */
  public async generateReplies(conversationHistory: string): Promise<string[]> {
    const prompt = `You are a social media manager. Based on this conversation history, suggest 3 short, professional, and friendly quick replies for the last message.
    
History:
${conversationHistory}

Format output as a simple list of 3 strings separated by newlines. No numbering.`;

    try {
      const response = await this.generateContent(prompt);
      return response
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(0, 3);
    } catch (_error) {
      // Fallback replies
      return [
        'Thank you for reaching out!',
        "We'll get back to you shortly.",
        'Could you provide more details?',
      ];
    }
  }

  /**
   * Analyze content sentiment and topics
   */
  public async analyzeContent(content: string): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    topics: string[];
    keywords: string[];
  }> {
    const span = tracer.startSpan('ai.analyzeContent', {
      attributes: {
        'ai.provider': 'gemini',
        'ai.content_length': content.length,
      },
    });

    const prompt = `Analyze this social media content and provide:
1. Sentiment (positive/neutral/negative)
2. Main topics (2-3 topics)
3. Key keywords (3-5 keywords)

Content: "${content}"

Format as JSON: {"sentiment": "...", "topics": [...], "keywords": [...]}`;

    try {
      const response = await this.generateContent(prompt);
      const parsed = JSON.parse(response);
      span.setAttribute('ai.sentiment', parsed.sentiment ?? 'unknown');
      span.setStatus({ code: SpanStatusCode.OK });
      return parsed;
    } catch (_error) {
      span.setAttribute('ai.fallback', true);
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'analyzeContent fallback' });
      return {
        sentiment: 'neutral',
        topics: ['general'],
        keywords: content.split(' ').slice(0, 5),
      };
    } finally {
      span.end();
    }
  }

  /**
   * Get circuit breaker status
   */
  public getCircuitStatus() {
    return circuitBreakerService.getStats('ai');
  }
}

export const aiService = new AIService();
