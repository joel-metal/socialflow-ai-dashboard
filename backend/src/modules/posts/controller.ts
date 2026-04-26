import { Request, Response, NextFunction } from 'express';
import { createPost, schedulePost } from './service';
import { createPostSchema, schedulePostSchema } from './schema';

export async function handleCreatePost(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createPostSchema.parse(req.body);
    const post = await createPost({
      ...data,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    });
    res.status(202).json({ post, message: 'Post created and queued for moderation' });
  } catch (err) {
    next(err);
  }
}

export async function handleSchedulePost(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { scheduledAt } = schedulePostSchema.parse(req.body);
    const post = await schedulePost(id, new Date(scheduledAt));
    res.json({ post });
  } catch (err) {
    next(err);
  }
}
