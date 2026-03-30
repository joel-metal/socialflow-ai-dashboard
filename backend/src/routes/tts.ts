import { Router } from 'express';
import { authenticate as authMiddleware } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createTTSJobSchema } from '../schemas/tts';
import { createTTSJob, getTTSJob, listTTSJobs, cancelTTSJob, listVoices } from '../controllers/tts';

const router = Router();

router.use(authMiddleware);

/**
 * @openapi
 * /tts/voices:
 *   get:
 *     tags: [TTS]
 *     summary: List available TTS voices
 *     responses:
 *       200:
 *         description: Voice list
 */
router.get('/voices', listVoices);

/**
 * @openapi
 * /tts/jobs:
 *   get:
 *     tags: [TTS]
 *     summary: List TTS jobs for the authenticated user
 *     responses:
 *       200:
 *         description: TTS job list
 *   post:
 *     tags: [TTS]
 *     summary: Create a new TTS job
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text, voiceId]
 *             properties:
 *               text:
 *                 type: string
 *               voiceId:
 *                 type: string
 *               stability:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               similarityBoost:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *     responses:
 *       202:
 *         description: TTS job queued
 *       400:
 *         description: Validation error
 */
router.get('/jobs', listTTSJobs);
router.post('/jobs', validate(createTTSJobSchema), createTTSJob);

/**
 * @openapi
 * /tts/jobs/{jobId}:
 *   get:
 *     tags: [TTS]
 *     summary: Get a TTS job by ID
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: TTS job details
 *       404:
 *         description: Job not found
 *   delete:
 *     tags: [TTS]
 *     summary: Cancel a TTS job
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job cancelled
 *       404:
 *         description: Job not found
 */
router.get('/jobs/:jobId', getTTSJob);
router.delete('/jobs/:jobId', cancelTTSJob);

export default router;
