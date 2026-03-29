import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { predictiveService } from '../services/PredictiveService';

const router = Router();

router.use(authMiddleware);

const predictReachSchema = z.object({
  content: z.string().min(1),
  platform: z.enum(['instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'x']),
  scheduledTime: z.string().datetime().optional(),
  hashtags: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
  mediaType: z.enum(['text', 'image', 'video', 'carousel']).optional(),
  followerCount: z.number().int().positive().optional(),
});

/**
 * @openapi
 * /predictive/reach:
 *   post:
 *     tags: [Predictive]
 *     summary: Predict reach for a social media post
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content, platform]
 *             properties:
 *               content: { type: string }
 *               platform: { type: string, enum: [instagram, tiktok, facebook, youtube, linkedin, x] }
 *               scheduledTime: { type: string, format: date-time }
 *               hashtags: { type: array, items: { type: string } }
 *               mentions: { type: array, items: { type: string } }
 *               mediaType: { type: string, enum: [text, image, video, carousel] }
 *               followerCount: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Reach prediction result
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/reach', validate(predictReachSchema), async (req: AuthRequest, res: Response) => {
  const input = {
    ...req.body,
    scheduledTime: req.body.scheduledTime ? new Date(req.body.scheduledTime) : undefined,
  };
  const prediction = await predictiveService.predictReach(input);
  return res.json(prediction);
});

/**
 * @openapi
 * /predictive/history/{postId}:
 *   get:
 *     tags: [Predictive]
 *     summary: Get prediction history for a post
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Prediction history
 *       401:
 *         description: Unauthorized
 */
router.get('/history/:postId', (_req: AuthRequest, res: Response) => {
  // History is stored client-side; return model metrics as server-side context
  return res.json({ metrics: predictiveService.getModelMetrics() });
});

export default router;
