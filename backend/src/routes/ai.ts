import { Router, Request, Response } from 'express';
import { analyzeImage, GeminiServiceError } from '../../../services/geminiService';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireCredits } from '../middleware/requireCredits';

const router = Router();

/**
 * @openapi
 * /ai/analyze-image:
 *   post:
 *     tags: [AI]
 *     summary: Generate a social media caption from an image using AI
 *     description: Accepts a base64-encoded image or public URL and returns an AI-generated caption. Deducts `ai:generate` credits.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageData]
 *             properties:
 *               imageData:
 *                 type: string
 *                 description: Base64-encoded image data or a public image URL
 *               mimeType:
 *                 type: string
 *                 default: image/jpeg
 *                 example: image/jpeg
 *               context:
 *                 type: string
 *                 description: Optional prompt context to guide caption style/topic
 *     responses:
 *       200:
 *         description: AI-generated caption
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 caption:
 *                   type: string
 *       400:
 *         description: imageData is required
 *       401:
 *         description: Unauthorized
 *       402:
 *         description: Insufficient credits
 *       422:
 *         description: AI processing error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string }
 *                 code: { type: string }
 *       500:
 *         description: Internal server error
 */
router.post(
  '/analyze-image',
  authMiddleware,
  requireCredits('ai:generate'),
  async (req: Request, res: Response) => {
    const { imageData, mimeType, context } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'imageData is required.' });
    }

    try {
      const caption = await analyzeImage(imageData, mimeType, context);
      return res.json({ caption });
    } catch (error) {
      if (error instanceof GeminiServiceError) {
        return res.status(422).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

export default router;
