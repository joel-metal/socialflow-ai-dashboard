import { z } from 'zod';

const segmentSchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().optional(),
  language: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
});

export const createTTSJobSchema = z.object({
  segments: z.array(segmentSchema).min(1).max(50),
  provider: z.enum(['elevenlabs', 'google']).optional(),
  outputFormat: z.enum(['mp3', 'wav', 'ogg']).optional(),
  videoPath: z.string().optional(),
});

export type CreateTTSJobInput = z.infer<typeof createTTSJobSchema>;
