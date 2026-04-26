import { z } from 'zod';

export const SUPPORTED_EVENTS = [
  'post.published',
  'post.failed',
  'analytics.report_ready',
  'blockchain.transaction_completed',
  'blockchain.transaction_failed',
  'system.health_check',
] as const;

export type WebhookEventType = (typeof SUPPORTED_EVENTS)[number];

export const createWebhookSchema = z.object({
  url: z
    .url({ message: 'Must be a valid HTTPS URL' })
    .refine((u: string) => u.startsWith('https://'), { message: 'Webhook URL must use HTTPS' }),
  secret: z.string().min(16, 'Secret must be at least 16 characters'),
  events: z.array(z.enum(SUPPORTED_EVENTS)).min(1, 'At least one event type is required'),
});

export const updateWebhookSchema = z.object({
  url: z
    .url()
    .refine((u: string) => u.startsWith('https://'))
    .optional(),
  secret: z.string().min(16).optional(),
  events: z.array(z.enum(SUPPORTED_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export const testWebhookSchema = z.object({
  eventType: z.enum(SUPPORTED_EVENTS),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
