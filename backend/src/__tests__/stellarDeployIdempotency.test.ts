import { deployContract, ContractSyncJobData } from '../queues/syncQueue';
import { queueManager } from '../queues/queueManager';

jest.mock('../queues/queueManager');

describe('Stellar Contract Deployment - Idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('deployContract', () => {
    it('should generate deterministic job ID from contract metadata', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('job-123');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      const contractData: ContractSyncJobData = {
        contractId: 'contract-abc',
        contractType: 'token',
        action: 'deploy',
        metadata: {
          deployer: 'GADDRESS123',
          network: 'testnet',
        },
      };

      await deployContract(contractData);

      expect(mockAddJob).toHaveBeenCalledWith(
        'sync',
        'deploy-contract',
        contractData,
        expect.objectContaining({
          jobId: 'deploy-token-contract-abc-GADDRESS123-testnet',
        }),
      );
    });

    it('should generate same job ID for identical contract deployments', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('job-123');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      const contractData: ContractSyncJobData = {
        contractId: 'contract-xyz',
        contractType: 'campaign',
        action: 'deploy',
        metadata: {
          deployer: 'GADDRESS456',
          network: 'mainnet',
        },
      };

      // First deployment
      await deployContract(contractData);
      const firstJobId = mockAddJob.mock.calls[0][3].jobId;

      // Retry with same data
      await deployContract(contractData);
      const secondJobId = mockAddJob.mock.calls[1][3].jobId;

      expect(firstJobId).toBe(secondJobId);
      expect(firstJobId).toBe('deploy-campaign-contract-xyz-GADDRESS456-mainnet');
    });

    it('should generate different job IDs for different contracts', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('job-123');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      const contract1: ContractSyncJobData = {
        contractId: 'contract-1',
        contractType: 'token',
        action: 'deploy',
        metadata: {
          deployer: 'GADDRESS123',
          network: 'testnet',
        },
      };

      const contract2: ContractSyncJobData = {
        contractId: 'contract-2',
        contractType: 'token',
        action: 'deploy',
        metadata: {
          deployer: 'GADDRESS123',
          network: 'testnet',
        },
      };

      await deployContract(contract1);
      const jobId1 = mockAddJob.mock.calls[0][3].jobId;

      await deployContract(contract2);
      const jobId2 = mockAddJob.mock.calls[1][3].jobId;

      expect(jobId1).not.toBe(jobId2);
      expect(jobId1).toBe('deploy-token-contract-1-GADDRESS123-testnet');
      expect(jobId2).toBe('deploy-token-contract-2-GADDRESS123-testnet');
    });

    it('should generate different job IDs for different deployers', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('job-123');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      const contract1: ContractSyncJobData = {
        contractId: 'contract-abc',
        contractType: 'token',
        action: 'deploy',
        metadata: {
          deployer: 'GADDRESS111',
          network: 'testnet',
        },
      };

      const contract2: ContractSyncJobData = {
        contractId: 'contract-abc',
        contractType: 'token',
        action: 'deploy',
        metadata: {
          deployer: 'GADDRESS222',
          network: 'testnet',
        },
      };

      await deployContract(contract1);
      const jobId1 = mockAddJob.mock.calls[0][3].jobId;

      await deployContract(contract2);
      const jobId2 = mockAddJob.mock.calls[1][3].jobId;

      expect(jobId1).not.toBe(jobId2);
      expect(jobId1).toBe('deploy-token-contract-abc-GADDRESS111-testnet');
      expect(jobId2).toBe('deploy-token-contract-abc-GADDRESS222-testnet');
    });

    it('should generate different job IDs for different networks', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('job-123');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      const contract1: ContractSyncJobData = {
        contractId: 'contract-abc',
        contractType: 'token',
        action: 'deploy',
        metadata: {
          deployer: 'GADDRESS123',
          network: 'testnet',
        },
      };

      const contract2: ContractSyncJobData = {
        contractId: 'contract-abc',
        contractType: 'token',
        action: 'deploy',
        metadata: {
          deployer: 'GADDRESS123',
          network: 'mainnet',
        },
      };

      await deployContract(contract1);
      const jobId1 = mockAddJob.mock.calls[0][3].jobId;

      await deployContract(contract2);
      const jobId2 = mockAddJob.mock.calls[1][3].jobId;

      expect(jobId1).not.toBe(jobId2);
      expect(jobId1).toBe('deploy-token-contract-abc-GADDRESS123-testnet');
      expect(jobId2).toBe('deploy-token-contract-abc-GADDRESS123-mainnet');
    });

    it('should use default values when metadata is missing', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('job-123');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      const contractData: ContractSyncJobData = {
        contractId: 'contract-abc',
        contractType: 'nft',
        action: 'deploy',
        // No metadata provided
      };

      await deployContract(contractData);

      expect(mockAddJob).toHaveBeenCalledWith(
        'sync',
        'deploy-contract',
        contractData,
        expect.objectContaining({
          jobId: 'deploy-nft-contract-abc-unknown-default',
        }),
      );
    });

    it('should use default values when deployer is missing', async () => {
      const mockAddJob = jest.fn().mockResolvedValue('job-123');
      (queueManager.addJob as jest.Mock) = mockAddJob;

      const contractData: ContractSyncJobData = {
        contractId: 'contract-abc',
        contractType: 'reward',
        action: 'deploy',
        metadata: {
          network: 'testnet',
        },
      };

      await deployContract(contractData);

      expect(mockAddJob).toHaveBeenCalledWith(
        'sync',
        'deploy-contract',
        contractData,
        expect.objectContaining({
          jobId: 'deploy-reward-contract-abc-unknown-testnet',
        }),
      );
    });

    it('should prevent duplicate deployment when retry occurs', async () => {
      const mockAddJob = jest.fn();
      mockAddJob.mockResolvedValueOnce('job-123'); // First call succeeds
      mockAddJob.mockResolvedValueOnce('job-123'); // Retry returns same job ID (no-op)

      (queueManager.addJob as jest.Mock) = mockAddJob;

      const contractData: ContractSyncJobData = {
        contractId: 'contract-abc',
        contractType: 'token',
        action: 'deploy',
        metadata: {
          deployer: 'GADDRESS123',
          network: 'mainnet',
        },
      };

      // First attempt
      const jobId1 = await deployContract(contractData);

      // Retry (e.g., due to network issue)
      const jobId2 = await deployContract(contractData);

      // Both should use the same deterministic job ID
      expect(mockAddJob).toHaveBeenCalledTimes(2);
      expect(mockAddJob.mock.calls[0][3].jobId).toBe(mockAddJob.mock.calls[1][3].jobId);
      expect(jobId1).toBe(jobId2);
    });
  });
});
