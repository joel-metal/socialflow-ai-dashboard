import { prisma } from '../../lib/prisma';
import { enqueueModeration } from '../../queues/moderationQueue';

export async function createPost(data: {
  organizationId: string;
  content: string;
  platform: string;
  scheduledAt?: Date;
}) {
  const post = await prisma.post.create({
    data: { ...data, moderationStatus: 'pending' },
  });

  // Kick off async moderation; post remains 'pending' until the job completes.
  await enqueueModeration(post.id);

  return post;
}

export async function schedulePost(postId: string, scheduledAt: Date) {
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

  if (post.moderationStatus !== 'approved') {
    throw Object.assign(new Error('Post cannot be scheduled until moderation is approved'), {
      status: 422,
      code: 'MODERATION_PENDING',
    });
  }

  return prisma.post.update({ where: { id: postId }, data: { scheduledAt } });
}
