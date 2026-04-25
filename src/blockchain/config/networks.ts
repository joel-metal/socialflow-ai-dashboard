/**
 * Stellar network configuration
 */

export interface NetworkConfig {
  horizonUrl: string;
  networkPassphrase: string;
  name: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  TESTNET: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    name: 'Testnet',
  },
  MAINNET: {
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    name: 'Mainnet',
  },
  FUTURENET: {
    horizonUrl: 'https://horizon-futurenet.stellar.org',
    networkPassphrase: 'Test SDF Future Network ; October 2022',
    name: 'Futurenet',
  },
};

export const DEFAULT_NETWORK = NETWORKS.TESTNET;
