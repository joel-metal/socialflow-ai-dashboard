import { queueManager } from './queueManager';

// Queue names
export const SYNC_QUEUE_NAME = 'sync';

// Sync job data interfaces
export interface BlockchainSyncJobData {
  type: 'account' | 'transactions' | 'balances' | 'contracts' | 'full';
  accountId?: string;
  startBlock?: number;
  endBlock?: number;
  metadata?: {
    userId?: string;
    campaignId?: string;
    source?: string;
  };
}

export interface ContractSyncJobData {
  contractId: string;
  contractType: 'token' | 'campaign' | 'reward' | 'nft';
  action: 'deploy' | 'update' | 'sync' | 'verify';
  metadata?: {
    deployer?: string;
    network?: string;
  };
}

// Create the sync queue with batch processing settings
export const syncQueue = queueManager.createQueue(SYNC_QUEUE_NAME, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 3000,
  },
  removeOnComplete: 50,
  removeOnFail: 100,
});

/**
 * Sync blockchain account data
 */
export async function syncAccount(
  accountId: string,
  metadata?: BlockchainSyncJobData['metadata'],
): Promise<string | undefined> {
  const data: BlockchainSyncJobData = {
    type: 'account',
    accountId,
    metadata,
  };

  return await queueManager.addJob(SYNC_QUEUE_NAME, 'sync-account', data, {
    priority: 2,
  });
}

/**
 * Sync blockchain transactions
 */
export async function syncTransactions(
  accountId: string,
  startBlock?: number,
  endBlock?: number,
  metadata?: BlockchainSyncJobData['metadata'],
): Promise<string | undefined> {
  const data: BlockchainSyncJobData = {
    type: 'transactions',
    accountId,
    startBlock,
    endBlock,
    metadata,
  };

  return await queueManager.addJob(SYNC_QUEUE_NAME, 'sync-transactions', data, {
    priority: 2,
  });
}

/**
 * Sync account balances
 */
export async function syncBalances(
  accountId: string,
  metadata?: BlockchainSyncJobData['metadata'],
): Promise<string | undefined> {
  const data: BlockchainSyncJobData = {
    type: 'balances',
    accountId,
    metadata,
  };

  return await queueManager.addJob(SYNC_QUEUE_NAME, 'sync-balances', data, {
    priority: 1, // High priority for balance updates
  });
}

/**
 * Full blockchain sync
 */
export async function fullSync(
  accountId: string,
  metadata?: BlockchainSyncJobData['metadata'],
): Promise<string | undefined> {
  const data: BlockchainSyncJobData = {
    type: 'full',
    accountId,
    metadata,
  };

  return await queueManager.addJob(SYNC_QUEUE_NAME, 'full-sync', data, {
    priority: 3, // Low priority for full syncs
  });
}

/**
 * Sync smart contract
 */
export async function syncContract(data: ContractSyncJobData): Promise<string | undefined> {
  return await queueManager.addJob(SYNC_QUEUE_NAME, 'sync-contract', data, {
    priority: 2,
  });
}

/**
 * Deploy smart contract with idempotency
 */
export async function deployContract(data: ContractSyncJobData): Promise<string | undefined> {
  // Generate deterministic job ID from contract metadata for idempotency
  const jobId = generateDeploymentJobId(data);

  return await queueManager.addJob(SYNC_QUEUE_NAME, 'deploy-contract', data, {
    priority: 1, // High priority for deployments
    jobId, // Use deterministic ID to prevent duplicate deployments
  });
}

/**
 * Generate deterministic job ID for contract deployment
 * Uses contract metadata to ensure retries don't create duplicate deployments
 */
function generateDeploymentJobId(data: ContractSyncJobData): string {
  const { contractId, contractType, metadata } = data;
  const deployer = metadata?.deployer || 'unknown';
  const network = metadata?.network || 'default';

  // Create deterministic ID from contract properties
  return `deploy-${contractType}-${contractId}-${deployer}-${network}`;
}

/**
 * Batch sync multiple accounts
 */
export async function batchSyncAccounts(accountIds: string[]): Promise<string[]> {
  const jobs = accountIds.map((accountId) => ({
    name: 'sync-account',
    data: { type: 'account', accountId } as BlockchainSyncJobData,
    options: { priority: 3 },
  }));

  return await queueManager.addBulkJobs(SYNC_QUEUE_NAME, jobs);
}

/**
 * Schedule periodic sync (cron-based)
 */
export async function schedulePeriodicSync(
  jobName: string,
  data: any,
  cronExpression: string,
): Promise<string | undefined> {
  return await queueManager.addJob(SYNC_QUEUE_NAME, jobName, data, {
    repeat: {
      pattern: cronExpression,
    },
  });
}

/**
 * Get sync queue statistics
 */
export async function getSyncQueueStats() {
  return await queueManager.getQueueStats(SYNC_QUEUE_NAME);
}

/**
 * Get failed sync jobs
 */
export async function getFailedSyncJobs(start: number = 0, end: number = 20) {
  return await queueManager.getFailedJobs(SYNC_QUEUE_NAME, start, end);
}

/**
 * Get waiting sync jobs
 */
export async function getWaitingSyncJobs(start: number = 0, end: number = 20) {
  return await queueManager.getWaitingJobs(SYNC_QUEUE_NAME, start, end);
}

/**
 * Retry a failed sync job
 */
export async function retryFailedSync(jobId: string) {
  return await queueManager.retryJob(SYNC_QUEUE_NAME, jobId);
}
