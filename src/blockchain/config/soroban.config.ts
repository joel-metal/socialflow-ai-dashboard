/**
 * Soroban configuration for different networks
 */

export interface SorobanConfig {
  rpcUrl: string;
  networkPassphrase: string;
}

export const SOROBAN_NETWORKS: Record<string, SorobanConfig> = {
  TESTNET: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  MAINNET: {
    rpcUrl: 'https://soroban-mainnet.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
  },
  FUTURENET: {
    rpcUrl: 'https://soroban-futurenet.stellar.org',
    networkPassphrase: 'Test SDF Future Network ; October 2022',
  },
};

/**
 * Default timeout for transaction polling in milliseconds
 * Can be overridden via STELLAR_POLL_TIMEOUT_MS environment variable
 */
export const DEFAULT_TIMEOUT = 30;

/**
 * Poll timeout in milliseconds (default 120 seconds)
 * Prevents indefinite polling for transactions stuck in mempool
 */
export const STELLAR_POLL_TIMEOUT_MS = parseInt(
  typeof window !== 'undefined' && (window as any).__STELLAR_POLL_TIMEOUT_MS
    ? (window as any).__STELLAR_POLL_TIMEOUT_MS
    : '120000',
  10
);
