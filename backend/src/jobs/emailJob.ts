import { Job } from 'bullmq';
import { queueManager } from '../queues/queueManager';
import { EmailJobData } from '../queues/emailQueue';

/**
 * Email job processor
 * Handles sending emails with retry logic and error handling
 */
export async function processEmailJob(job: Job<EmailJobData>) {
  const { to, subject, body, html: _html, attachments: _attachments, metadata } = job.data;

  console.log(`[EmailJob] Processing job ${job.id} - sending to ${to}`);

  try {
    // Log job progress
    await job.updateProgress(10);

    // Validate email data
    if (!to || !subject || !body) {
      throw new Error('Missing required email fields: to, subject, or body');
    }

    // Log progress
    await job.updateProgress(20);

    // Simulate email sending - replace with actual email service implementation
    // const emailService = require('../services/emailService').emailService;
    // const result = await emailService.send({
    //   to,
    //   subject,
    //   body,
    //   html,
    //   attachments,
    // });

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 100));

    await job.updateProgress(90);

    // Log completion
    console.log(`[EmailJob] Job ${job.id} completed successfully`);

    return {
      success: true,
      emailId: job.id,
      recipient: to,
      subject,
      sentAt: new Date().toISOString(),
      metadata,
    };
  } catch (error: any) {
    console.error(`[EmailJob] Job ${job.id} failed:`, error.message);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Create email worker using the queue manager
 */
export function createEmailWorker() {
  return queueManager.createWorker('email', processEmailJob, {
    concurrency: 10,
  });
}

/**
 * Process bulk email job
 */
export async function processBulkEmailJob(job: Job<{ emails: EmailJobData[] }>) {
  const { emails } = job.data;

  console.log(`[BulkEmailJob] Processing job ${job.id} - ${emails.length} emails`);

  const results: Array<{
    success: boolean;
    emailId?: string;
    recipient?: string;
    error?: string;
  }> = [];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];

    try {
      // Simulate sending each email
      await new Promise((resolve) => setTimeout(resolve, 50));

      results.push({
        success: true,
        emailId: `${job.id}-${i}`,
        recipient: email.to,
      });

      await job.updateProgress(Math.floor(((i + 1) / emails.length) * 100));
    } catch (error: any) {
      results.push({
        success: false,
        recipient: email.to,
        error: error.message,
      });
    }
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`[BulkEmailJob] Job ${job.id} completed: ${successful} sent, ${failed} failed`);

  return {
    success: true,
    jobId: job.id,
    total: emails.length,
    successful,
    failed,
    results,
    completedAt: new Date().toISOString(),
  };
}
