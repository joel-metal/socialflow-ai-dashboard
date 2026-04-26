import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createTTSJobSchema } from '../schemas/tts';
import { createTTSJob, getTTSJob, listTTSJobs, cancelTTSJob, listVoices } from '../controllers/tts';

const router = Router();

router.use(authMiddleware);

router.get('/voices', listVoices);
router.get('/jobs', listTTSJobs);
router.post('/jobs', validate(createTTSJobSchema), createTTSJob);
router.get('/jobs/:jobId', getTTSJob);
router.delete('/jobs/:jobId', cancelTTSJob);

export default router;
