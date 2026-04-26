import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { dynamicConfigService, ConfigKey } from '../services/DynamicConfigService';
import { createLogger } from '../lib/logger';

const logger = createLogger('twitter-webhook');

const router = Router();

// ── Webhook re-registration ──────────────────────────────────────────────────

/**
 * Re-registers the Twitter webhook with the current secret.
 * Called once at startup and again whenever the secret is rotated.
 */
async function registerWebhook(secret: string): Promise<void> {
  const webhookUrl = process.env.TWITTER_WEBHOOK_URL;
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;

  if (!webhookUrl || !bearerToken) {
    logger.warn('[twitter-webhook] TWITTER_WEBHOOK_URL or TWITTER_BEARER_TOKEN not set — skipping registration');
    return;
  }

  try {
    // Twitter Account Activity API: register/update the webhook URL
    const response = await fetch(
      `https://api.twitter.com/1.1/account_activity/all/${process.env.TWITTER_WEBHOOK_ENV ?? 'dev'}/webhooks.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ url: webhookUrl }).toString(),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      logger.error(`[twitter-webhook] Re-registration failed (${response.status}): ${body}`);
    } else {
      logger.info('[twitter-webhook] Webhook registered/updated successfully');
    }
  } catch (err) {
    logger.error('[twitter-webhook] Re-registration error:', err);
  }
}

// ── Secret change listener ───────────────────────────────────────────────────

// Seed from env on first load so the service works before any DB record exists
if (process.env.TWITTER_WEBHOOK_SECRET) {
  dynamicConfigService
    .set(ConfigKey.TWITTER_WEBHOOK_SECRET, process.env.TWITTER_WEBHOOK_SECRET, 'string', 'Twitter webhook HMAC secret')
    .catch(console.error);
}

// Subscribe to runtime rotations
dynamicConfigService.onChange(ConfigKey.TWITTER_WEBHOOK_SECRET, (_key, newSecret: string) => {
  logger.info('[twitter-webhook] Secret rotated — re-registering webhook');
  registerWebhook(newSecret).catch(console.error);
});

// Register once at startup with whatever secret is currently configured
const initialSecret = dynamicConfigService.get<string>(
  ConfigKey.TWITTER_WEBHOOK_SECRET,
  process.env.TWITTER_WEBHOOK_SECRET ?? ''
);
if (initialSecret) {
  registerWebhook(initialSecret).catch(console.error);
}

// ── HMAC helper ──────────────────────────────────────────────────────────────

function getSecret(): string {
  return dynamicConfigService.get<string>(
    ConfigKey.TWITTER_WEBHOOK_SECRET,
    process.env.TWITTER_WEBHOOK_SECRET ?? ''
  );
}

function buildCrcResponse(crcToken: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(crcToken).digest('base64');
  return `sha256=${hmac}`;
}

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('base64')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/twitter-webhook
 * Twitter CRC challenge — responds with HMAC-SHA256 of the crc_token.
 */
router.get('/', (req: Request, res: Response) => {
  const crcToken = req.query.crc_token as string | undefined;
  if (!crcToken) {
    return res.status(400).json({ error: 'Missing crc_token' });
  }

  const secret = getSecret();
  if (!secret) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  res.json({ response_token: buildCrcResponse(crcToken, secret) });
});

/**
 * POST /api/twitter-webhook
 * Receives Twitter Account Activity events.
 * Verifies the x-twitter-webhooks-signature header before processing.
 */
router.post('/', express.raw({ type: 'application/json' }), (req: Request, res: Response) => {
  const signature = req.headers['x-twitter-webhooks-signature'] as string | undefined;
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature header' });
  }

  const secret = getSecret();
  if (!secret) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  if (!verifySignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse and handle the event payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  logger.info('[twitter-webhook] Received event', { type: Object.keys(payload)[0] });

  // Acknowledge immediately — process asynchronously as needed
  res.sendStatus(200);
});

export default router;
