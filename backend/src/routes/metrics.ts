import { Router, Request, Response } from 'express';
import { register } from '../lib/metrics';
import { queueManager } from '../queues/queueManager';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  await queueManager.refreshQueueMetrics();
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

export default router;
