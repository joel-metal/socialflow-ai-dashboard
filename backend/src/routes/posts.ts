import { Router } from 'express';
import { z } from 'zod';
import { authenticate as authMiddleware } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createPost } from '../controllers/PostController';

const router = Router();

const createPostSchema = z.object({
  content: z.string().min(1).max(5000),
  platform: z.enum(['twitter', 'linkedin', 'instagram', 'tiktok', 'facebook', 'youtube']),
  organizationId: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
});

router.use(authMiddleware);

/**
 * @openapi
 * /posts:
 *   post:
 *     tags: [Posts]
 *     summary: Create a new social media post (optionally scheduled)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content, platform, organizationId]
 *             properties:
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 5000
 *               platform:
 *                 type: string
 *                 enum: [twitter, linkedin, instagram, tiktok, facebook, youtube]
 *               organizationId:
 *                 type: string
 *                 format: uuid
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 description: ISO 8601 datetime — omit to publish immediately
 *     responses:
 *       201:
 *         description: Post created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', validate(createPostSchema), createPost);

export default router;
