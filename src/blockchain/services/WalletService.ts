/**
 * WalletService - Manages wallet connections and transactions
 */

export interface WalletInfo {
  publicKey: string;
  name: string;
  isConnected: boolean;
}

export interface WalletDisconnectEvent {
  type: 'disconnect';
  timestamp: number;
}

type DisconnectListener = (event: WalletDisconnectEvent) => void;

export class WalletService {
  private wallet: WalletInfo | null = null;
  private disconnectListeners: Set<DisconnectListener> = new Set();
  private isListeningForDisconnect = false;

  /**
   * Auto-connect to available wallet
   */
  async autoConnect(): Promise<WalletInfo | null> {
    try {
      // Try Freighter first
      if ((window as any).freighter) {
        const publicKey = await (window as any).freighter.getPublicKey();
        this.wallet = {
          publicKey,
          name: 'Freighter',
          isConnected: true,
        };
        this.setupDisconnectListener();
        return this.wallet;
      }

      // Try Albedo
      if ((window as any).albedo) {
        const result = await (window as any).albedo.publicKey();
        this.wallet = {
          publicKey: result.publicKey,
          name: 'Albedo',
          isConnected: true,
        };
        this.setupDisconnectListener();
        return this.wallet;
      }

      return null;
    } catch (error) {
      console.error('Failed to auto-connect wallet:', error);
      return null;
    }
  }

  /**
   * Setup listener for wallet disconnection events
   */
  private setupDisconnectListener(): void {
    if (this.isListeningForDisconnect) return;

    this.isListeningForDisconnect = true;

    // Listen for Freighter disconnect
    if ((window as any).freighter) {
      (window as any).freighter.on?.('disconnect', () => {
        this.handleDisconnect();
      });
    }

    // Listen for visibility changes (user may switch wallets)
    window.addEventListener('visibilitychange', () => {
      if (document.hidden === false) {
        this.checkWalletConnection();
      }
    });
  }

  /**
   * Check if wallet is still connected
   */
  private async checkWalletConnection(): Promise<void> {
    if (!this.wallet) return;

    try {
      if ((window as any).freighter) {
        const publicKey = await (window as any).freighter.getPublicKey();
        if (publicKey !== this.wallet.publicKey) {
          this.handleDisconnect();
        }
      }
    } catch (error) {
      this.handleDisconnect();
    }
  }

  /**
   * Handle wallet disconnection
   */
  private handleDisconnect(): void {
    if (!this.wallet) return;

    const event: WalletDisconnectEvent = {
      type: 'disconnect',
      timestamp: Date.now(),
    };

    this.wallet = null;
    this.disconnectListeners.forEach(listener => listener(event));
  }

  /**
   * Sign a transaction
   */
  async signTransaction(xdr: string, network: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      if ((window as any).freighter) {
        return await (window as any).freighter.signTransaction(xdr, {
          network,
        });
      }

      if ((window as any).albedo) {
        const result = await (window as any).albedo.tx({
          xdr,
          network,
        });
        return result.signed_envelope_xdr;
      }

      throw new Error('No wallet available for signing');
    } catch (error) {
      // Check if disconnection caused the error
      if (error instanceof Error && error.message.includes('disconnect')) {
        this.handleDisconnect();
      }
      throw error;
    }
  }

  /**
   * Subscribe to disconnect events
   */
  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this.wallet = null;
    this.isListeningForDisconnect = false;
  }

  /**
   * Get current wallet info
   */
  getWallet(): WalletInfo | null {
    return this.wallet;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.wallet !== null;
  }
}

export const walletService = new WalletService();
