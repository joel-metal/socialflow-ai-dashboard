import { z } from 'zod';

/**
 * Validation schemas for /api/auth routes.
 *
 * Adding a new rule:
 *   1. Add/extend the relevant schema below using Zod's chainable API.
 *   2. Pass the schema to the `validate()` middleware in the route file.
 *
 * Available Zod primitives: z.string(), z.number(), z.boolean(), z.enum(),
 * z.object(), z.array(), z.optional(), z.nullable(), and more — see https://zod.dev
 */

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
