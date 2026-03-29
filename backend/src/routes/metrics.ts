import { Router, Request, Response } from 'express';
import { register } from '../lib/metrics';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

export default router;
