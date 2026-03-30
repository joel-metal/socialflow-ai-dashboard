import { Router } from 'express';
import { handleCreatePost, handleSchedulePost } from './controller';

const router = Router();

router.post('/', handleCreatePost);
router.patch('/:id/schedule', handleSchedulePost);

export default router;
