import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createWebhookSchema, updateWebhookSchema, testWebhookSchema } from '../schemas/webhooks';
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

router.get('/', listWebhooks);
router.post('/', validate(createWebhookSchema), createWebhook);
router.get('/:id', getWebhook);
router.patch('/:id', validate(updateWebhookSchema), updateWebhook);
router.delete('/:id', deleteWebhook);
router.post('/:id/test', actionLimiter, validate(testWebhookSchema), testWebhook);
router.get('/:id/deliveries', listDeliveries);
router.post('/:id/deliveries/:deliveryId/replay', actionLimiter, replayDelivery);

export default router;
