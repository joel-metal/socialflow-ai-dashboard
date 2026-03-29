import { Job } from 'bullmq';
import { queueManager } from '../queues/queueManager';
import { PayoutJobData } from '../queues/payoutQueue';

/**
 * Payout job processor
 * Handles processing payouts with retry logic and error handling
 */
export async function processPayoutJob(job: Job<PayoutJobData>) {
  const {
    groupId,
    amount,
    recipient,
    recipientType,
    currency,
    description: _description,
    metadata,
  } = job.data;

  console.log(`[PayoutJob] Processing job ${job.id} - ${amount} ${currency} to ${recipient}`);

  try {
    // Log job progress
    await job.updateProgress(10);

    // Validate payout data
    if (!groupId || !amount || !recipient || !recipientType || !currency) {
      throw new Error('Missing required payout fields');
    }

    if (amount <= 0) {
      throw new Error('Payout amount must be greater than 0');
    }

    // Log progress
    await job.updateProgress(20);

    // Simulate payout processing - replace with actual payment service implementation
    // const paymentService = require('../services/paymentService').paymentService;
    // const result = await paymentService.process({
    //   groupId,
    //   amount,
    //   recipient,
    //   recipientType,
    //   currency,
    //   description,
    // });

    // Simulate processing time for financial transaction
    await new Promise((resolve) => setTimeout(resolve, 500));

    await job.updateProgress(80);

    // Simulate blockchain transaction if applicable
    if (recipientType === 'crypto' || recipientType === 'wallet') {
      // const blockchainService = require('../services/blockchainService').blockchainService;
      // await blockchainService.submitTransaction({ ... });
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await job.updateProgress(95);

    // Log completion
    console.log(
      `[PayoutJob] Job ${job.id} completed successfully - ${amount} ${currency} sent to ${recipient}`,
    );

    return {
      success: true,
      transactionId: job.id,
      groupId,
      amount,
      currency,
      recipient,
      recipientType,
      status: 'completed',
      processedAt: new Date().toISOString(),
      metadata,
    };
  } catch (error: any) {
    console.error(`[PayoutJob] Job ${job.id} failed:`, error.message);
    throw new Error(`Failed to process payout: ${error.message}`);
  }
}

/**
 * Create payout worker using the queue manager
 */
export function createPayoutWorker() {
  return queueManager.createWorker('payout', processPayoutJob, {
    concurrency: 3, // Lower concurrency for financial transactions
  });
}

/**
 * Process batch payout job
 */
export async function processBatchPayoutJob(job: Job<{ payouts: PayoutJobData[] }>) {
  const { payouts } = job.data;

  console.log(`[BatchPayoutJob] Processing job ${job.id} - ${payouts.length} payouts`);

  const results: Array<{
    success: boolean;
    transactionId?: string;
    recipient?: string;
    error?: string;
  }> = [];

  let totalAmount = 0;
  let successfulAmount = 0;

  for (let i = 0; i < payouts.length; i++) {
    const payout = payouts[i];

    try {
      // Validate payout
      if (!payout.groupId || !payout.amount || !payout.recipient) {
        throw new Error('Missing required payout fields');
      }

      totalAmount += payout.amount;

      // Simulate processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      successfulAmount += payout.amount;

      results.push({
        success: true,
        transactionId: `${job.id}-${i}`,
        recipient: payout.recipient,
      });

      await job.updateProgress(Math.floor(((i + 1) / payouts.length) * 100));
    } catch (error: any) {
      results.push({
        success: false,
        recipient: payout.recipient,
        error: error.message,
      });
    }
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(
    `[BatchPayoutJob] Job ${job.id} completed: ${successful} successful (${successfulAmount}), ${failed} failed`,
  );

  return {
    success: true,
    jobId: job.id,
    totalPayouts: payouts.length,
    successfulPayouts: successful,
    failedPayouts: failed,
    totalAmount,
    successfulAmount,
    results,
    completedAt: new Date().toISOString(),
  };
}
