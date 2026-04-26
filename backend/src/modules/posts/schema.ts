import { z } from 'zod';

export const createPostSchema = z.object({
  organizationId: z.string().uuid(),
  content: z.string().min(1).max(5000),
  platform: z.enum(['twitter', 'facebook', 'instagram', 'tiktok', 'youtube']),
  scheduledAt: z.string().datetime().optional(),
});

export const schedulePostSchema = z.object({
  scheduledAt: z.string().datetime(),
});
