import { Router, Request, Response } from 'express';

/**
 * GET /api/analytics
 * Returns aggregated analytics stored in the client-side DB via a lightweight
 * proxy. In production this would query a server-side DB; for now it delegates
 * to the frontend AnalyticsService through IPC or returns a structured stub.
 *
 * Query params:
 *   platform  {string}  Filter by platform (twitter|linkedin|instagram|tiktok)
 *   from      {number}  Unix ms — start of date range
 *   to        {number}  Unix ms — end of date range
 */
const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const { platform, from, to } = _req.query;

  // Validation
  if (platform && !['twitter', 'linkedin', 'instagram', 'tiktok'].includes(platform as string)) {
    return res.status(400).json({ error: 'Invalid platform value.' });
  }
  if ((from && isNaN(Number(from))) || (to && isNaN(Number(to)))) {
    return res.status(400).json({ error: 'from and to must be numeric Unix timestamps.' });
  }

  // The actual data lives in IndexedDB on the client (Electron / browser).
  // This endpoint is the server-side contract; the frontend AnalyticsService
  // is the authoritative store. Return the filter params so the client can
  // apply them locally, or wire up a server DB here when needed.
  return res.json({
    message: 'Query analytics via the client-side AnalyticsService.',
    filters: {
      platform: platform ?? null,
      from: from ? Number(from) : null,
      to: to ? Number(to) : null,
    },
  });
});

export default router;
