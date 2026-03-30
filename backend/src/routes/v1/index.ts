import { Router, Request, Response } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { authLimiter, aiLimiter, generalLimiter } from '../../middleware/rateLimit';
import { ipWhitelistMiddleware } from '../../middleware/ipWhitelist';
import { swaggerSpec } from '../../config/swagger';

// Route modules
import authRoutes           from '../auth';
import aiRoutes             from '../ai';
import analyticsRoutes      from '../analytics';
import auditRoutes          from '../audit';
import billingRoutes        from '../billing';
import circuitBreakerRoutes from '../circuitBreaker';
import configRoutes         from '../config';
import exportsRoutes        from '../exports';
import facebookRoutes       from '../facebook';
import healthRoutes         from '../health';
import imagesRoutes         from '../images';
import jobsRoutes           from '../jobs';
import listingsRoutes       from '../listings';
import organizationsRoutes  from '../organizations';
import postsRoutes          from '../posts';
import realtimeRoutes       from '../realtime';
import rolesRoutes          from '../roles';
import statusRoutes         from '../status';
import tiktokRoutes         from '../tiktok';
import translationRoutes    from '../translation';
import ttsRoutes            from '../tts';
import videoRoutes          from '../video';
import webhookRoutes        from '../webhooks';
import twitterWebhookRoutes from '../twitter-webhook';
import youtubeRoutes        from '../youtube';
import linkedInRoutes       from '../linkedin';
import searchRoutes         from '../search';
import predictiveRoutes     from '../predictive';

const router = Router();

// ── Version metadata ──────────────────────────────────────────────────────────
// GET /api/v1 — public, returns version/status/docs link
router.get('/', (_req: Request, res: Response) => {
  res.json({
    version: 'v1',
    status: 'stable',
    deprecated: false,
    sunsetDate: null,
    docs: '/api/v1/docs',
  });
});

// ── OpenAPI / Swagger UI ──────────────────────────────────────────────────────
// GET /api/v1/openapi.json — public, raw OpenAPI spec
router.get('/openapi.json', (_req: Request, res: Response) => res.json(swaggerSpec));
// GET /api/v1/docs — public, Swagger UI explorer
router.use(
  '/docs',
  helmet({ contentSecurityPolicy: false }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, { explorer: true }),
);

// ── Infrastructure (IP-whitelisted, no auth) ──────────────────────────────────
router.use('/health',  ipWhitelistMiddleware, healthRoutes);  // GET /api/v1/health/status — no auth, IP-whitelisted
router.use('/status',  ipWhitelistMiddleware, statusRoutes);  // GET /api/v1/status — no auth, IP-whitelisted

// ── Auth (strict rate limiter — brute-force protection) ───────────────────────
router.use('/auth', authLimiter, authRoutes);
// POST /api/v1/auth/register       — public
// POST /api/v1/auth/login          — public
// POST /api/v1/auth/refresh        — public
// POST /api/v1/auth/logout         — public
// POST /api/v1/auth/change-password — auth required

// ── AI / high-cost endpoints (strict per-minute limiter) ─────────────────────
router.use('/ai',          aiLimiter, aiRoutes);          // POST /api/v1/ai/analyze-image — auth required, credits required
router.use('/tts',         aiLimiter, ttsRoutes);         // GET|POST /api/v1/tts/voices|jobs — auth required
router.use('/translation', aiLimiter, translationRoutes); // POST /api/v1/translation/translate|detect — auth required

// ── General API (standard rate limiter) ──────────────────────────────────────
router.use('/analytics',       generalLimiter, analyticsRoutes);                              // GET  /api/v1/analytics — auth required
router.use('/audit',           generalLimiter, ipWhitelistMiddleware, auditRoutes);           // GET  /api/v1/audit|audit/me|audit/resource/:type/:id — auth required, IP-whitelisted
router.use('/billing',         generalLimiter, billingRoutes);                                // GET|POST|DELETE /api/v1/billing/* — auth required
router.use('/circuit-breaker', generalLimiter, ipWhitelistMiddleware, circuitBreakerRoutes);  // GET|POST /api/v1/circuit-breaker/* — auth required, IP-whitelisted
router.use('/config',          generalLimiter, ipWhitelistMiddleware, configRoutes);          // GET|POST|PUT /api/v1/config/* — auth required (admin), IP-whitelisted
router.use('/exports',         generalLimiter, exportsRoutes);                                // POST /api/v1/exports/* — auth required
router.use('/facebook',        generalLimiter, facebookRoutes);                               // GET|POST /api/v1/facebook/* — auth required
router.use('/images',          generalLimiter, imagesRoutes);                                 // POST /api/v1/images/optimize|upload — auth required
router.use('/jobs',            generalLimiter, ipWhitelistMiddleware, jobsRoutes);            // GET|POST|DELETE /api/v1/jobs/* — auth required, IP-whitelisted
router.use('/listings',        generalLimiter, listingsRoutes);                               // GET /api/v1/listings/search — public; PATCH /api/v1/listings/:id/visibility — auth required
router.use('/organizations',   generalLimiter, organizationsRoutes);                          // GET|POST|DELETE /api/v1/organizations/* — auth required
router.use('/posts',           generalLimiter, postsRoutes);                                  // POST /api/v1/posts — auth required
router.use('/realtime',        generalLimiter, realtimeRoutes);                               // GET /api/v1/realtime/stream — auth required (JWT via query param)
router.use('/roles',           generalLimiter, rolesRoutes);                                  // GET|POST|DELETE /api/v1/roles/* — auth required
router.use('/tiktok',          generalLimiter, tiktokRoutes);                                 // GET|POST /api/v1/tiktok/* — auth required
router.use('/video',           generalLimiter, videoRoutes);                                  // POST /api/v1/video/* — auth required
router.use('/webhooks',        generalLimiter, webhookRoutes);                                // GET|POST|DELETE /api/v1/webhooks/* — auth required
// Twitter Account Activity API — no auth middleware, secured via HMAC signature verification
router.use('/webhooks/twitter', twitterWebhookRoutes);                                        // GET|POST /api/v1/webhooks/twitter/* — HMAC-signed, no JWT
router.use('/youtube',         generalLimiter, youtubeRoutes);                                // GET|POST /api/v1/youtube/* — auth required
router.use('/linkedin',        generalLimiter, linkedInRoutes);                               // GET|POST /api/v1/linkedin/* — auth required
router.use('/search',          generalLimiter, searchRoutes);                                 // GET /api/v1/search/posts|key — auth required
router.use('/predictive',      generalLimiter, predictiveRoutes);                             // POST /api/v1/predictive/reach; GET /api/v1/predictive/history/:postId — auth required

export default router;
