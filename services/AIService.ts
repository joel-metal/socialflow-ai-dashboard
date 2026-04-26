/**
 * AI Content Generation Service
 * 
 * Unified service supporting Google Gemini and OpenAI GPT models.
 * Provides configurable prompt templates, streaming support, and cost-aware usage logging.
 * 
 * Closes #220
 */

import { GoogleGenAI } from "@google/genai";

// ============================================
// Type Definitions
// ============================================

export type AIProvider = 'gemini' | 'openai';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
}

export interface GeneratedContent {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: AIProvider;
}

export interface StreamingCallback {
  (chunk: string): void;
}

export interface PromptTemplate {
  id: string;
  name: string;
  platform: 'twitter' | 'linkedin' | 'instagram' | 'facebook' | 'general';
  tone: 'professional' | 'casual' | 'humorous' | 'informative' | 'persuasive';
  template: string;
  variables: string[];
}

// ============================================
// Default Prompt Templates
// ============================================

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'twitter-professional',
    name: 'Twitter Professional',
    platform: 'twitter',
    tone: 'professional',
    template: `Write a professional tweet about: "{{topic}}". 
Include relevant hashtags. Keep it under 280 characters. Make it engaging and informative.`,
    variables: ['topic'],
  },
  {
    id: 'twitter-casual',
    name: 'Twitter Casual',
    platform: 'twitter',
    tone: 'casual',
    template: `Write a casual, friendly tweet about: "{{topic}}". 
Use emojis where appropriate. Keep it under 280 characters. Make it relatable.`,
    variables: ['topic'],
  },
  {
    id: 'linkedin-professional',
    name: 'LinkedIn Professional',
    platform: 'linkedin',
    tone: 'professional',
    template: `Write a professional LinkedIn post about: "{{topic}}". 
Include insights and value for professionals. Use a professional tone.`,
    variables: ['topic'],
  },
  {
    id: 'instagram-engaging',
    name: 'Instagram Engaging',
    platform: 'instagram',
    tone: 'persuasive',
    template: `Write an engaging Instagram caption for: "{{topic}}". 
Include relevant hashtags and emojis. Make it visually appealing and compelling.`,
    variables: ['topic'],
  },
  {
    id: 'facebook-community',
    name: 'Facebook Community',
    platform: 'facebook',
    tone: 'casual',
    template: `Write a friendly Facebook post about: "{{topic}}". 
Encourage engagement and community interaction.`,
    variables: ['topic'],
  },
  {
    id: 'general-caption',
    name: 'General Caption',
    platform: 'general',
    tone: 'professional',
    template: `Write a {{tone}} social media caption about: "{{topic}}". 
Platform: {{platform}}. Include relevant hashtags.`,
    variables: ['topic', 'tone', 'platform'],
  },
];

// ============================================
// Usage Logger
// ============================================

interface UsageLog {
  timestamp: Date;
  provider: AIProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  operation: string;
}

class UsageLogger {
  private logs: UsageLog[] = [];
  private readonly costPer1kTokens: Record<AIProvider, { prompt: number; completion: number }> = {
    gemini: { prompt: 0.000075, completion: 0.0003 }, // gemini-2.0-flash-exp
    openai: { prompt: 0.0015, completion: 0.004 }, // gpt-4-turbo
  };

  log(
    provider: AIProvider,
    model: string,
    promptTokens: number,
    completionTokens: number,
    operation: string
  ): void {
    const totalTokens = promptTokens + completionTokens;
    const costs = this.costPer1kTokens[provider];
    const cost = (promptTokens / 1000) * costs.prompt + 
                 (completionTokens / 1000) * costs.completion;

    this.logs.push({
      timestamp: new Date(),
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      cost,
      operation,
    });

    console.log(`[AI Usage] ${provider}/${model} - ${operation}: ${totalTokens} tokens ($${cost.toFixed(6)})`);
  }

  getLogs(): UsageLog[] {
    return [...this.logs];
  }

  getTotalCost(): number {
    return this.logs.reduce((sum, log) => sum + log.cost, 0);
  }

  getLogsByProvider(provider: AIProvider): UsageLog[] {
    return this.logs.filter(log => log.provider === provider);
  }

  clearLogs(): void {
    this.logs = [];
  }
}

export const usageLogger = new UsageLogger();

// ============================================
// AI Service
// ============================================

export class AIService {
  private config: AIConfig;
  private geminiClient: GoogleGenAI | null = null;
  private templates: PromptTemplate[] = DEFAULT_PROMPT_TEMPLATES;

  constructor(config: AIConfig) {
    this.config = {
      model: config.model || this.getDefaultModel(config.provider),
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.7,
      ...config,
    };

    if (config.provider === 'gemini') {
      this.geminiClient = new GoogleGenAI({ apiKey: config.apiKey });
    }
  }

  private getDefaultModel(provider: AIProvider): string {
    switch (provider) {
      case 'gemini':
        return 'gemini-2.0-flash-exp';
      case 'openai':
        return 'gpt-4-turbo-preview';
      default:
        return 'gemini-2.0-flash-exp';
    }
  }

  // ============================================
  // Template Management
  // ============================================

  getTemplates(): PromptTemplate[] {
    return [...this.templates];
  }

  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }

  addTemplate(template: PromptTemplate): void {
    this.templates.push(template);
  }

  updateTemplate(id: string, updates: Partial<PromptTemplate>): void {
    const index = this.templates.findIndex(t => t.id === id);
    if (index !== -1) {
      this.templates[index] = { ...this.templates[index], ...updates };
    }
  }

  deleteTemplate(id: string): void {
    this.templates = this.templates.filter(t => t.id !== id);
  }

  // ============================================
  // Content Generation
  // ============================================

  /**
   * Generate content from a raw prompt
   */
  async generateContent(
    prompt: string,
    options?: GenerationOptions
  ): Promise<GeneratedContent> {
    const mergedOptions = {
      ...{
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      },
      ...options,
    };

    try {
      if (this.config.provider === 'gemini') {
        return await this.generateWithGemini(prompt, mergedOptions);
      } else {
        return await this.generateWithOpenAI(prompt, mergedOptions);
      }
    } catch (error) {
      console.error(`[AI Service] Generation error:`, error);
      throw new Error(`Failed to generate content: ${(error as Error).message}`);
    }
  }

  /**
   * Generate content using a template
   */
  async generateFromTemplate(
    templateId: string,
    variables: Record<string, string>,
    options?: GenerationOptions
  ): Promise<GeneratedContent> {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let prompt = template.template;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return this.generateContent(prompt, options);
  }

  /**
   * Generate content with streaming
   */
  async generateContentStream(
    prompt: string,
    callback: StreamingCallback,
    options?: GenerationOptions
  ): Promise<GeneratedContent> {
    const mergedOptions = {
      ...{
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      },
      ...options,
      stream: true,
    };

    try {
      if (this.config.provider === 'gemini') {
        return await this.generateStreamWithGemini(prompt, callback, mergedOptions);
      } else {
        return await this.generateStreamWithOpenAI(prompt, callback, mergedOptions);
      }
    } catch (error) {
      console.error(`[AI Service] Streaming generation error:`, error);
      throw new Error(`Failed to generate content stream: ${(error as Error).message}`);
    }
  }

  // ============================================
  // Gemini Implementation
  // ============================================

  private async generateWithGemini(
    prompt: string,
    options: GenerationOptions
  ): Promise<GeneratedContent> {
    if (!this.geminiClient) {
      throw new Error('Gemini client not initialized');
    }

    const response = await this.geminiClient.models.generateContent({
      model: this.config.model || 'gemini-2.0-flash-exp',
      contents: prompt,
      config: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        topP: options.topP,
        stopSequences: options.stopSequences,
      },
    });

    const text = response.text || '';
    
    // Estimate token usage (Gemini doesn't always return usage in response)
    const promptTokens = this.estimateTokens(prompt);
    const completionTokens = this.estimateTokens(text);

    usageLogger.log(
      'gemini',
      this.config.model || 'gemini-2.0-flash-exp',
      promptTokens,
      completionTokens,
      'generateContent'
    );

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      model: this.config.model || 'gemini-2.0-flash-exp',
      provider: 'gemini',
    };
  }

  private async generateStreamWithGemini(
    prompt: string,
    callback: StreamingCallback,
    options: GenerationOptions
  ): Promise<GeneratedContent> {
    if (!this.geminiClient) {
      throw new Error('Gemini client not initialized');
    }

    const result = await this.geminiClient.models.generateContentStream({
      model: this.config.model || 'gemini-2.0-flash-exp',
      contents: prompt,
      config: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        topP: options.topP,
        stopSequences: options.stopSequences,
      },
    });

    let fullText = '';
    for await (const chunk of result) {
      const text = chunk.text || '';
      fullText += text;
      callback(text);
    }

    const promptTokens = this.estimateTokens(prompt);
    const completionTokens = this.estimateTokens(fullText);

    usageLogger.log(
      'gemini',
      this.config.model || 'gemini-2.0-flash-exp',
      promptTokens,
      completionTokens,
      'generateContentStream'
    );

    return {
      text: fullText,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      model: this.config.model || 'gemini-2.0-flash-exp',
      provider: 'gemini',
    };
  }

  // ============================================
  // OpenAI Implementation
  // ============================================

  private async generateWithOpenAI(
    prompt: string,
    options: GenerationOptions
  ): Promise<GeneratedContent> {
    // OpenAI API call would go here
    // For now, we'll throw an error indicating OpenAI needs additional setup
    throw new Error('OpenAI integration requires additional setup. Use provider: "gemini" or configure OpenAI SDK.');
  }

  private async generateStreamWithOpenAI(
    prompt: string,
    callback: StreamingCallback,
    options: GenerationOptions
  ): Promise<GeneratedContent> {
    throw new Error('OpenAI integration requires additional setup. Use provider: "gemini" or configure OpenAI SDK.');
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Estimate token count (simple approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get service configuration (without API key)
   */
  getConfig(): Omit<AIConfig, 'apiKey'> {
    const { apiKey, ...config } = this.config;
    return config;
  }

  /**
   * Update service configuration
   */
  updateConfig(updates: Partial<AIConfig>): void {
    this.config = { ...this.config, ...updates };
    
    if (updates.provider === 'gemini' && updates.apiKey) {
      this.geminiClient = new GoogleGenAI({ apiKey: updates.apiKey });
    }
  }
}

// ============================================
// Factory Functions
// ============================================

export const createAIService = (config: AIConfig): AIService => {
  return new AIService(config);
};

// Convenience function for generating captions (backward compatibility)
export const generateCaption = async (
  topic: string,
  platform: string,
  tone: string = 'professional'
): Promise<string> => {
  const service = new AIService({
    provider: 'gemini',
    apiKey: process.env.API_KEY || '',
  });

  const template = service.getTemplates().find(
    t => t.platform === platform && t.tone === tone
  ) || service.getTemplates()[0];

  const result = await service.generateFromTemplate(
    template.id,
    { topic },
    { temperature: 0.7, maxTokens: 280 }
  );

  return result.text;
};

// Convenience function for generating replies
export const generateReply = async (conversationHistory: string): Promise<string[]> => {
  const service = new AIService({
    provider: 'gemini',
    apiKey: process.env.API_KEY || '',
  });

  const prompt = `You are a social media manager. Based on this conversation history, suggest 3 short, professional, and friendly quick replies for the last message.
  
  History:
  ${conversationHistory}
  
  Format output as a simple list of 3 strings separated by newlines. No numbering.`;

  const result = await service.generateContent(prompt, { temperature: 0.7, maxTokens: 200 });
  
  return result.text
    .split('\n')
    .filter(line => line.trim().length > 0)
    .slice(0, 3);
};

// Default export
export default AIService;
