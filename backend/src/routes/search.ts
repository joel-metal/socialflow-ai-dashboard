import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { searchPosts } from '../services/SearchService';
import { config } from '../config/config';

const router = Router();

const searchQuerySchema = z.object({
  q: z.string().min(1),
  organizationId: z.string().uuid().optional(),
  platform: z.enum(['twitter', 'linkedin', 'instagram', 'tiktok', 'facebook', 'youtube']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/v1/search/posts — authenticated full-text search */
router.get('/posts', authMiddleware, validate(searchQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, organizationId, platform, limit, offset } = req.query as unknown as z.infer<typeof searchQuerySchema>;
    const results = await searchPosts(q, { organizationId, platform, limit, offset });
    res.json(results);
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/search/key — returns the public search-only API key for frontend use */
router.get('/key', authMiddleware, (_req: Request, res: Response) => {
  res.json({ searchKey: config.MEILISEARCH_SEARCH_KEY, host: config.MEILISEARCH_HOST });
});

export default router;
