import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createWebhookSchema, updateWebhookSchema, testWebhookSchema } from '../schemas/webhooks';
import { verifySignature, rawBodyMiddleware } from '../middleware/verifySignature';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import {
  listWebhooks,
  createWebhook,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  listDeliveries,
  replayDelivery,
} from '../controllers/webhooks';

const logger = createLogger('webhook-routes');

const router = Router();

// Rate limiting: 60 requests/min per IP for general endpoints, stricter for test/replay
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
const actionLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// All webhook routes require authentication
router.use(authMiddleware);
router.use(generalLimiter);

/**
 * @openapi
 * /webhooks:
 *   get:
 *     tags: [Webhooks]
 *     summary: List all webhook subscriptions for the authenticated user
 *     responses:
 *       200:
 *         description: Array of webhook subscriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WebhookSubscription'
 *       401:
 *         description: Unauthorized
 *   post:
 *     tags: [Webhooks]
 *     summary: Create a new webhook subscription
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, events]
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [post.published, post.failed, analytics.report_ready, blockchain.transaction]
 *               secret:
 *                 type: string
 *                 description: Optional HMAC signing secret
 *     responses:
 *       201:
 *         description: Webhook created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookSubscription'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/', listWebhooks);
router.post('/', validate(createWebhookSchema), createWebhook);

/**
 * @openapi
 * /webhooks/{id}:
 *   get:
 *     tags: [Webhooks]
 *     summary: Get a webhook subscription by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Webhook subscription
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookSubscription'
 *       404:
 *         description: Not found
 *   patch:
 *     tags: [Webhooks]
 *     summary: Update a webhook subscription
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated webhook
 *       404:
 *         description: Not found
 *   delete:
 *     tags: [Webhooks]
 *     summary: Delete a webhook subscription
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.get('/:id', getWebhook);
router.patch('/:id', validate(updateWebhookSchema), updateWebhook);
router.delete('/:id', deleteWebhook);

/**
 * @openapi
 * /webhooks/{id}/test:
 *   post:
 *     tags: [Webhooks]
 *     summary: Send a test event to a webhook
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               eventType:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test delivery result
 *       404:
 *         description: Not found
 */
router.post('/:id/test', actionLimiter, validate(testWebhookSchema), testWebhook);

/**
 * @openapi
 * /webhooks/{id}/deliveries:
 *   get:
 *     tags: [Webhooks]
 *     summary: List delivery attempts for a webhook
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of delivery records
 *       404:
 *         description: Not found
 */
router.get('/:id/deliveries', listDeliveries);

/**
 * @openapi
 * /webhooks/{id}/deliveries/{deliveryId}/replay:
 *   post:
 *     tags: [Webhooks]
 *     summary: Replay a specific webhook delivery
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: deliveryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Replay result
 *       404:
 *         description: Not found
 */
router.post('/:id/deliveries/:deliveryId/replay', actionLimiter, replayDelivery);

// ── Inbound webhook listener ──────────────────────────────────────────────────
// Receives signed payloads from third-party services.
// No auth middleware — authenticated via HMAC signature instead.
// The subscription's hashed secret is looked up by :id.
router.post(
  '/:id/incoming',
  rawBodyMiddleware,
  verifySignature({
    // Look up the subscription's stored secret by the webhook ID in the URL
    getSecret: async (req) => {
      const sub = await prisma.webhookSubscription.findUnique({
        where: { id: req.params.id },
        select: { secret: true },
      });
      return sub?.secret ?? null;
    },
  }),
  (req, res) => {
    logger.info('Inbound webhook received', {
      subscriptionId: req.params.id,
      path: req.path,
    });
    // Consumers can extend this handler to process the verified payload
    res.status(200).json({ received: true });
  },
);

export default router;
