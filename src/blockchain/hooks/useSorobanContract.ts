import { useState, useCallback, useEffect } from 'react';
import { SmartContractService } from '../services/SmartContractService';
import { walletService, WalletInfo } from '../services/WalletService';
import { ContractCallType, ContractInvocationResult } from '../types/soroban';
import { xdr } from '@stellar/stellar-sdk';
import { AppError } from '../../utils/AppError';
import { ErrorCode } from '../../constants/ErrorCodes';

/**
 * React hook for Soroban contract interactions
 */
export function useSorobanContract(
    contractId: string,
    network: 'TESTNET' | 'MAINNET' | 'FUTURENET' = 'TESTNET'
) {
    const [contractService] = useState(() => new SmartContractService(network));
    const [wallet, setWallet] = useState<WalletInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Setup wallet disconnect listener
     */
    useEffect(() => {
        const unsubscribe = walletService.onDisconnect(() => {
            setWallet(null);
            setIsLoading(false);
            setError('Wallet disconnected. Please reconnect to continue.');
        });

        return unsubscribe;
    }, []);

    /**
     * Connect wallet
     */
    const connectWallet = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const connectedWallet = await walletService.autoConnect();
            if (!connectedWallet) {
                throw new AppError(ErrorCode.ERR_WALLET_NOT_AVAILABLE, 'No wallet available. Please install Freighter or Albedo.');
            }

            setWallet(connectedWallet);
            return connectedWallet;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
            setError(errorMessage);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Disconnect wallet
     */
    const disconnectWallet = useCallback(() => {
        walletService.disconnect();
        setWallet(null);
        setError(null);
    }, []);

    /**
     * Read-only contract call
     */
    const readContract = useCallback(
        async (method: string, args: xdr.ScVal[] = []): Promise<any> => {
            if (!wallet) {
                throw new AppError(ErrorCode.ERR_WALLET_NOT_CONNECTED);
            }

            setIsLoading(true);
            setError(null);

            try {
                const result = await contractService.invoke(
                    { contractId, method, args },
                    wallet.publicKey,
                    ContractCallType.READ_ONLY
                );

                if (!result.success) {
                    throw new AppError(ErrorCode.ERR_TRANSACTION_FAILED, result.error || 'Contract call failed');
                }

                return result.result;
            } catch (err) {
                const errorMessage = AppError.isAppError(err) ? err.message : (err instanceof Error ? err.message : 'Contract call failed');
                setError(errorMessage);
                throw err;
            } finally {
                setIsLoading(false);
            }
        },
        [contractService, contractId, wallet]
    );

    /**
     * State-changing contract call (requires signature)
     */
    const writeContract = useCallback(
        async (method: string, args: xdr.ScVal[] = []): Promise<ContractInvocationResult> => {
            if (!wallet) {
                throw new AppError(ErrorCode.ERR_WALLET_NOT_CONNECTED);
            }

            setIsLoading(true);
            setError(null);

            try {
                const signTransaction = async (xdrString: string) => {
                    try {
                        return await walletService.signTransaction(xdrString, network.toLowerCase());
                    } catch (signError) {
                        // Check if wallet was disconnected during signing
                        if (!walletService.isConnected()) {
                            setWallet(null);
                            setIsLoading(false);
                            setError('Wallet disconnected during transaction signing. Please reconnect and try again.');
                            throw new AppError(
                                ErrorCode.ERR_WALLET_NOT_CONNECTED,
                                'Wallet disconnected mid-transaction'
                            );
                        }
                        throw signError;
                    }
                };

                const result = await contractService.invoke(
                    { contractId, method, args },
                    wallet.publicKey,
                    ContractCallType.STATE_CHANGING,
                    signTransaction
                );

                if (!result.success) {
                    const errorMessage = result.error || 'Transaction failed';
                    setError(errorMessage);

                    // Provide user-friendly error messages
                    if (result.errorType === 'OUT_OF_GAS') {
                        throw new AppError(ErrorCode.ERR_TRANSACTION_FAILED, 'Transaction ran out of gas. Please try again with higher limits.');
                    } else if (result.errorType === 'SIMULATION_FAILED') {
                        throw new AppError(ErrorCode.ERR_TRANSACTION_FAILED, `Simulation failed: ${errorMessage}`);
                    } else if (result.errorType === 'SERVICE_UNAVAILABLE') {
                        throw new AppError(ErrorCode.ERR_TRANSACTION_FAILED, `Service unavailable: ${errorMessage}`);
                    } else {
                        throw new AppError(ErrorCode.ERR_TRANSACTION_FAILED, errorMessage);
                    }
                }

                return result;
            } catch (err) {
                const errorMessage = AppError.isAppError(err) ? err.message : (err instanceof Error ? err.message : 'Transaction failed');
                setError(errorMessage);
                throw err;
            } finally {
                setIsLoading(false);
            }
        },
        [contractService, contractId, wallet, network]
    );

    /**
     * Simulate contract call
     */
    const simulateContract = useCallback(
        async (method: string, args: xdr.ScVal[] = []) => {
            if (!wallet) {
                throw new AppError(ErrorCode.ERR_WALLET_NOT_CONNECTED);
            }

            setIsLoading(true);
            setError(null);

            try {
                const result = await contractService.simulate(
                    { contractId, method, args },
                    wallet.publicKey
                );

                if (!result.success) {
                    throw new AppError(ErrorCode.ERR_TRANSACTION_FAILED, result.error || 'Simulation failed');
                }

                return result;
            } catch (err) {
                const errorMessage = AppError.isAppError(err) ? err.message : (err instanceof Error ? err.message : 'Simulation failed');
                setError(errorMessage);
                throw err;
            } finally {
                setIsLoading(false);
            }
        },
        [contractService, contractId, wallet]
    );

    /**
     * Get contract events
     */
    const getEvents = useCallback(
        async (startLedger?: number, endLedger?: number) => {
            setIsLoading(true);
            setError(null);

            try {
                const events = await contractService.getContractEvents(
                    contractId,
                    startLedger,
                    endLedger
                );
                return events;
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to fetch events';
                setError(errorMessage);
                throw err;
            } finally {
                setIsLoading(false);
            }
        },
        [contractService, contractId]
    );

    return {
        // State
        wallet,
        isLoading,
        error,
        isConnected: !!wallet,

        // Actions
        connectWallet,
        disconnectWallet,
        readContract,
        writeContract,
        simulateContract,
        getEvents,
    };
}
