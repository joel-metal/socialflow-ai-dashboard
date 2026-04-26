import {
    SorobanRpc,
    Contract,
    TransactionBuilder,
    Networks,
    Operation,
    Account,
    BASE_FEE,
    xdr,
    hash,
    Keypair,
} from '@stellar/stellar-sdk';
import {
    ContractInvocationParams,
    ContractSimulationResult,
    ContractInvocationResult,
    WasmDeploymentParams,
    WasmDeploymentResult,
    SorobanConfig,
    ContractCallType,
} from '../types/soroban';
import { SOROBAN_NETWORKS, DEFAULT_TIMEOUT, STELLAR_POLL_TIMEOUT_MS } from '../config/soroban.config';

/**
 * SmartContractService - Handles Soroban smart contract interactions
 * 
 * Features:
 * - Read-only contract calls (simulation)
 * - State-changing calls with wallet signature
 * - WASM deployment for admins
 * - Event parsing from transaction metadata
 * - Resource usage estimation and fee calculation
 */
export class SmartContractService {
    private server: SorobanRpc.Server;
    private config: SorobanConfig;
    private networkPassphrase: string;

    constructor(network: 'TESTNET' | 'MAINNET' | 'FUTURENET' = 'TESTNET') {
        this.config = SOROBAN_NETWORKS[network];
        this.server = new SorobanRpc.Server(this.config.rpcUrl, {
            allowHttp: network !== 'MAINNET',
        });
        this.networkPassphrase = this.config.networkPassphrase;
    }

    /**
     * Simulate a contract invocation (read-only)
     * This doesn't require wallet signature and is used for:
     * - Reading contract state
     * - Estimating resource usage before submission
     */
    async simulate(
        params: ContractInvocationParams,
        sourceAccount: string
    ): Promise<ContractSimulationResult> {
        try {
            const contract = new Contract(params.contractId);
            const account = await this.server.getAccount(sourceAccount);

            // Build transaction for simulation
            const transaction = new TransactionBuilder(account, {
                fee: BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(
                    contract.call(params.method, ...params.args)
                )
                .setTimeout(DEFAULT_TIMEOUT)
                .build();

            // Simulate the transaction
            const simulation = await this.server.simulateTransaction(transaction);

            if (SorobanRpc.Api.isSimulationError(simulation)) {
                return {
                    success: false,
                    cost: { cpuInstructions: '0', memoryBytes: '0' },
                    minResourceFee: '0',
                    error: simulation.error,
                };
            }

            if (!SorobanRpc.Api.isSimulationSuccess(simulation)) {
                return {
                    success: false,
                    cost: { cpuInstructions: '0', memoryBytes: '0' },
                    minResourceFee: '0',
                    error: 'Simulation failed with unknown error',
                };
            }

            return {
                success: true,
                result: simulation.result?.retval,
                cost: {
                    cpuInstructions: simulation.cost?.cpuInsns || '0',
                    memoryBytes: simulation.cost?.memBytes || '0',
                },
                minResourceFee: simulation.minResourceFee || '0',
                events: simulation.events,
            };
        } catch (error) {
            return {
                success: false,
                cost: { cpuInstructions: '0', memoryBytes: '0' },
                minResourceFee: '0',
                error: error instanceof Error ? error.message : 'Unknown simulation error',
            };
        }
    }

    /**
     * Invoke a contract method (helper for both read-only and state-changing calls)
     * 
     * @param params - Contract invocation parameters
     * @param sourceAccount - Source account public key
     * @param callType - Type of call (READ_ONLY or STATE_CHANGING)
     * @param signTransaction - Optional function to sign transaction (required for state-changing calls)
     */
    async invoke(
        params: ContractInvocationParams,
        sourceAccount: string,
        callType: ContractCallType = ContractCallType.READ_ONLY,
        signTransaction?: (xdr: string) => Promise<string>
    ): Promise<ContractInvocationResult> {
        try {
            // Step 1: Simulate to get resource usage
            const simulationResult = await this.simulate(params, sourceAccount);

            if (!simulationResult.success) {
                return {
                    success: false,
                    error: simulationResult.error,
                    errorType: 'SIMULATION_FAILED',
                };
            }

            // For read-only calls, return simulation result
            if (callType === ContractCallType.READ_ONLY) {
                return {
                    success: true,
                    result: simulationResult.result,
                    events: simulationResult.events,
                };
            }

            // Step 2: For state-changing calls, prepare and submit transaction
            if (!signTransaction) {
                return {
                    success: false,
                    error: 'ERR_AUTH_REQUIRED: Sign transaction function required for state-changing calls',
                    errorType: 'TRANSACTION_FAILED',
                };
            }

            const contract = new Contract(params.contractId);
            const account = await this.server.getAccount(sourceAccount);

            // Build transaction with proper resource limits
            let transaction = new TransactionBuilder(account, {
                fee: BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(contract.call(params.method, ...params.args))
                .setTimeout(DEFAULT_TIMEOUT)
                .build();

            // Prepare transaction with simulation results
            const preparedTx = await this.server.prepareTransaction(transaction);

            // Step 3: Request wallet signature
            const signedXdr = await signTransaction(preparedTx.toXDR());
            const signedTransaction = TransactionBuilder.fromXDR(
                signedXdr,
                this.networkPassphrase
            );

            // Step 4: Submit transaction
            const response = await this.server.sendTransaction(signedTransaction);

            if (response.status === 'ERROR') {
                return {
                    success: false,
                    error: response.errorResult?.toXDR('base64'),
                    errorType: 'TRANSACTION_FAILED',
                };
            }

            // Step 5: Wait for transaction confirmation
            const txHash = response.hash;
            const txResult = await this.pollTransactionStatus(txHash);

            return txResult;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Check for out-of-gas errors
            if (errorMessage.includes('out of gas') || errorMessage.includes('insufficient')) {
                return {
                    success: false,
                    error: errorMessage,
                    errorType: 'OUT_OF_GAS',
                };
            }

            return {
                success: false,
                error: errorMessage,
                errorType: 'UNKNOWN',
            };
        }
    }

    /**
     * Poll transaction status until it's confirmed or fails
     * Throws ServiceUnavailableError if polling exceeds STELLAR_POLL_TIMEOUT_MS
     */
    private async pollTransactionStatus(
        txHash: string,
        maxAttempts: number = 10
    ): Promise<ContractInvocationResult> {
        let attempts = 0;
        const startTime = Date.now();

        while (attempts < maxAttempts) {
            // Check if polling has exceeded timeout
            if (Date.now() - startTime > STELLAR_POLL_TIMEOUT_MS) {
                return {
                    success: false,
                    error: `Transaction polling timeout exceeded (${STELLAR_POLL_TIMEOUT_MS}ms). Transaction may be stuck in mempool.`,
                    errorType: 'SERVICE_UNAVAILABLE',
                };
            }

            try {
                const txResponse = await this.server.getTransaction(txHash);

                if (txResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
                    // Parse events from transaction meta
                    const events = this.parseTransactionEvents(txResponse);

                    return {
                        success: true,
                        transactionHash: txHash,
                        result: txResponse.returnValue,
                        events,
                    };
                }

                if (txResponse.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
                    return {
                        success: false,
                        transactionHash: txHash,
                        error: 'Transaction failed',
                        errorType: 'TRANSACTION_FAILED',
                    };
                }

                // Transaction still pending, wait and retry
                await new Promise((resolve) => setTimeout(resolve, 1000));
                attempts++;
            } catch (error) {
                attempts++;
                if (attempts >= maxAttempts) {
                    return {
                        success: false,
                        error: 'Transaction polling timeout',
                        errorType: 'SERVICE_UNAVAILABLE',
                    };
                }
            }
        }

        return {
            success: false,
            error: 'Transaction confirmation timeout',
            errorType: 'SERVICE_UNAVAILABLE',
        };
    }

    /**
     * Parse events from transaction metadata
     */
    private parseTransactionEvents(
        txResponse: SorobanRpc.Api.GetSuccessfulTransactionResponse
    ): SorobanRpc.Api.EventResponse[] {
        try {
            if (!txResponse.resultMetaXdr) {
                return [];
            }

            const meta = xdr.TransactionMeta.fromXDR(txResponse.resultMetaXdr, 'base64');

            // Extract events from transaction meta
            if (meta.switch() === 3 && meta.v3()?.sorobanMeta()?.events()) {
                const events = meta.v3()?.sorobanMeta()?.events() || [];

                return events.map((event, index) => ({
                    type: event.type().name,
                    ledger: txResponse.ledger.toString(),
                    ledgerClosedAt: txResponse.createdAt,
                    contractId: event.contractId()?.toString('hex'),
                    id: `${txResponse.hash}-${index}`,
                    pagingToken: `${txResponse.ledger}-${index}`,
                    topic: event.body().value()?.topics?.() || [],
                    value: event.body().value()?.data?.(),
                    inSuccessfulContractCall: true,
                    txHash: txResponse.hash,
                }));
            }

            return [];
        } catch (error) {
            console.error('Error parsing transaction events:', error);
            return [];
        }
    }

    /**
     * Deploy WASM contract (admin function)
     * 
     * @param params - WASM deployment parameters
     * @param sourceAccount - Source account public key
     * @param signTransaction - Function to sign transaction
     */
    async deployWasm(
        params: WasmDeploymentParams,
        sourceAccount: string,
        signTransaction: (xdr: string) => Promise<string>
    ): Promise<WasmDeploymentResult> {
        try {
            const account = await this.server.getAccount(sourceAccount);

            // Step 1: Upload WASM
            const wasmHash = hash(params.wasmBuffer);

            const uploadOp = Operation.uploadContractWasm({
                wasm: params.wasmBuffer,
            });

            let uploadTx = new TransactionBuilder(account, {
                fee: BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(uploadOp)
                .setTimeout(DEFAULT_TIMEOUT)
                .build();

            // Prepare and sign upload transaction
            const preparedUploadTx = await this.server.prepareTransaction(uploadTx);
            const signedUploadXdr = await signTransaction(preparedUploadTx.toXDR());
            const signedUploadTx = TransactionBuilder.fromXDR(
                signedUploadXdr,
                this.networkPassphrase
            );

            // Submit upload transaction
            const uploadResponse = await this.server.sendTransaction(signedUploadTx);

            if (uploadResponse.status === 'ERROR') {
                return {
                    success: false,
                    error: 'Failed to upload WASM',
                };
            }

            // Wait for upload confirmation
            await this.pollTransactionStatus(uploadResponse.hash);

            // Step 2: Create contract instance
            const salt = params.salt || Buffer.from(Keypair.random().rawPublicKey());

            const createOp = Operation.createCustomContract({
                wasmHash,
                salt,
            });

            // Refresh account sequence
            const refreshedAccount = await this.server.getAccount(sourceAccount);

            let createTx = new TransactionBuilder(refreshedAccount, {
                fee: BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            })
                .addOperation(createOp)
                .setTimeout(DEFAULT_TIMEOUT)
                .build();

            // Prepare and sign create transaction
            const preparedCreateTx = await this.server.prepareTransaction(createTx);
            const signedCreateXdr = await signTransaction(preparedCreateTx.toXDR());
            const signedCreateTx = TransactionBuilder.fromXDR(
                signedCreateXdr,
                this.networkPassphrase
            );

            // Submit create transaction
            const createResponse = await this.server.sendTransaction(signedCreateTx);

            if (createResponse.status === 'ERROR') {
                return {
                    success: false,
                    error: 'Failed to create contract instance',
                };
            }

            // Wait for creation confirmation
            const createResult = await this.pollTransactionStatus(createResponse.hash);

            if (!createResult.success) {
                return {
                    success: false,
                    error: createResult.error,
                };
            }

            // Extract contract ID from result
            const contractId = this.extractContractId(createResult.result);

            return {
                success: true,
                contractId,
                wasmHash: wasmHash.toString('hex'),
                transactionHash: createResponse.hash,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown deployment error',
            };
        }
    }

    /**
     * Extract contract ID from deployment result
     */
    private extractContractId(result?: xdr.ScVal): string | undefined {
        try {
            if (!result) return undefined;

            if (result.switch().name === 'scvAddress') {
                const address = result.address();
                if (address.switch().name === 'scAddressTypeContract') {
                    return address.contractId().toString('hex');
                }
            }

            return undefined;
        } catch (error) {
            console.error('Error extracting contract ID:', error);
            return undefined;
        }
    }

    /**
     * Get contract events by filter
     */
    async getContractEvents(
        contractId: string,
        startLedger?: number,
        endLedger?: number
    ): Promise<SorobanRpc.Api.EventResponse[]> {
        try {
            const response = await this.server.getEvents({
                filters: [
                    {
                        type: 'contract',
                        contractIds: [contractId],
                    },
                ],
                startLedger,
                limit: 100,
            });

            return response.events || [];
        } catch (error) {
            console.error('Error fetching contract events:', error);
            return [];
        }
    }

    /**
     * Get current network health
     */
    async getHealth(): Promise<{ status: string; ledger?: number }> {
        try {
            const health = await this.server.getHealth();
            const latestLedger = await this.server.getLatestLedger();

            return {
                status: health.status,
                ledger: latestLedger.sequence,
            };
        } catch (error) {
            return {
                status: 'error',
            };
        }
    }
}

// Export singleton instance for testnet
export const sorobanService = new SmartContractService('TESTNET');
