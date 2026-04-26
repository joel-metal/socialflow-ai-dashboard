import React, { useState, useEffect } from 'react';
import { Card } from './Card';
import { SponsoredBadge } from './SponsoredBadge';
import { blockchainService } from '../../services/blockchainService';
import { PaymentTransaction, SponsorshipTier, WalletConnection } from '../../types';
import { AppError } from '../../src/utils/AppError';
import { ErrorCode } from '../../src/constants/ErrorCodes';

const stripeErrorToMessage: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.ERR_INSUFFICIENT_FUNDS]: 'Your balance is too low to complete this payment.',
  [ErrorCode.ERR_PAYMENT_REQUIRED]: 'Payment is required to proceed.',
  [ErrorCode.ERR_TRANSACTION_FAILED]: 'The transaction could not be completed. Please try again.',
  [ErrorCode.ERR_TRANSACTION_EXPIRED]: 'This transaction has expired. Please start over.',
  [ErrorCode.ERR_TRANSACTION_NOT_SIGNED]: 'Transaction was not signed. Please approve it in your wallet.',
  [ErrorCode.ERR_WALLET_NOT_CONNECTED]: 'Your wallet is not connected. Please connect and try again.',
  [ErrorCode.ERR_WALLET_NOT_AVAILABLE]: 'No wallet detected. Please install a compatible wallet.',
  [ErrorCode.ERR_BLOCKCHAIN_UNAVAILABLE]: 'The payment network is temporarily unavailable. Please try later.',
  [ErrorCode.ERR_NETWORK_ERROR]: 'A network error occurred. Please check your connection and retry.',
  [ErrorCode.ERR_INTERNAL_SERVER_ERROR]: 'Something went wrong on our end. Please try again shortly.',
};

function getErrorMessage(err: unknown): string {
  if (AppError.isAppError(err)) {
    return stripeErrorToMessage[err.code as ErrorCode] ?? 'An unexpected payment error occurred.';
  }
  return 'An unexpected error occurred. Please try again.';
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: (transaction: PaymentTransaction) => void;
  postId: string;
}

const MaterialIcon = ({ name, className }: { name: string, className?: string }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onPaymentComplete,
  postId
}) => {
  const [selectedTier, setSelectedTier] = useState<'basic' | 'premium' | 'enterprise'>('basic');
  const [wallet, setWallet] = useState<WalletConnection>({ isConnected: false });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'connect' | 'confirm' | 'processing' | 'success'>('select');

  const tiers = blockchainService.getSponsorshipTiers();

  useEffect(() => {
    if (isOpen) {
      setWallet(blockchainService.getWalletStatus());
      setStep(blockchainService.getWalletStatus().isConnected ? 'select' : 'connect');
      setError(null);
      setErrorCode(null);
    }
  }, [isOpen]);

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    setErrorCode(null);
    
    try {
      const connection = await blockchainService.connectWallet();
      setWallet(connection);
      setStep('select');
    } catch (err) {
      setError(getErrorMessage(err));
      if (AppError.isAppError(err)) {
        setErrorCode(err.code);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    setError(null);
    setErrorCode(null);
    setStep('processing');

    try {
      // Create transaction
      const transaction = await blockchainService.createPaymentTransaction(postId, selectedTier);
      
      // Lock funds in treasury
      const fundsLocked = await blockchainService.lockFundsInTreasury(transaction.amount);
      if (!fundsLocked) {
        throw new AppError(ErrorCode.ERR_INSUFFICIENT_FUNDS, 'Failed to lock funds in treasury');
      }

      // Submit transaction
      const completedTransaction = await blockchainService.submitTransaction(transaction);
      
      if (completedTransaction.status === 'confirmed') {
        setStep('success');
        setTimeout(() => {
          onPaymentComplete(completedTransaction);
          onClose();
        }, 2000);
      } else {
        throw new AppError(ErrorCode.ERR_TRANSACTION_FAILED, 'Transaction failed');
      }
    } catch (err) {
      setError(getErrorMessage(err));
      if (AppError.isAppError(err)) {
        setErrorCode(err.code);
      }
      setStep('confirm');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const selectedTierData = tiers.find(t => t.id === selectedTier)!;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">Promote Post</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <MaterialIcon name="close" className="text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <MaterialIcon name="error" className="text-sm" />
              <div className="flex flex-col">
                <span className="font-semibold">{errorCode || 'Error'}:</span>
                <span>{error}</span>
              </div>
            </div>
          </div>
        )}

        {step === 'connect' && (
          <div className="text-center">
            <div className="mb-6">
              <MaterialIcon name="account_balance_wallet" className="text-4xl text-gray-400 mb-3" />
              <h4 className="text-lg font-semibold text-white mb-2">Connect Wallet</h4>
              <p className="text-gray-400 text-sm">Connect your wallet to promote your post</p>
            </div>
            <button
              onClick={handleConnectWallet}
              disabled={isConnecting}
              className="w-full bg-primary-blue hover:bg-primary-blue/80 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isConnecting ? (
                <>
                  <MaterialIcon name="sync" className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <MaterialIcon name="account_balance_wallet" />
                  Connect Wallet
                </>
              )}
            </button>
          </div>
        )}

        {step === 'select' && (
          <div>
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-white mb-2">Select Promotion Tier</h4>
              <p className="text-gray-400 text-sm">Choose how you want to promote your post</p>
            </div>

            <div className="space-y-3 mb-6">
              {tiers.map((tier) => (
                <div
                  key={tier.id}
                  onClick={() => setSelectedTier(tier.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedTier === tier.id
                      ? 'border-primary-blue bg-primary-blue/10'
                      : 'border-white/10 hover:border-white/20 bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <SponsoredBadge tier={tier.id} />
                      <span className="font-semibold text-white">{tier.name}</span>
                    </div>
                    <span className="text-lg font-bold text-white">{tier.price} XLM</span>
                  </div>
                  <div className="text-sm text-gray-400 mb-2">
                    {tier.duration}h promotion • {tier.reach}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tier.features.map((feature, index) => (
                      <span key={index} className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white/5 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Wallet Balance:</span>
                <span className="text-white font-semibold">{wallet.balance} XLM</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-gray-400">Promotion Cost:</span>
                <span className="text-white font-semibold">{selectedTierData.price} XLM</span>
              </div>
              <div className="border-t border-white/10 mt-2 pt-2 flex items-center justify-between">
                <span className="text-white font-semibold">Remaining Balance:</span>
                <span className="text-white font-semibold">
                  {(wallet.balance || 0) - selectedTierData.price} XLM
                </span>
              </div>
            </div>

            <button
              onClick={() => setStep('confirm')}
              disabled={(wallet.balance || 0) < selectedTierData.price}
              className="w-full bg-primary-blue hover:bg-primary-blue/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl transition-colors"
            >
              Continue to Payment
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div>
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-white mb-2">Confirm Payment</h4>
              <p className="text-gray-400 text-sm">Review your promotion details</p>
            </div>

            <div className="bg-white/5 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400">Promotion Tier:</span>
                <SponsoredBadge tier={selectedTier} showDetails />
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400">Duration:</span>
                <span className="text-white">{selectedTierData.duration} hours</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400">Estimated Reach:</span>
                <span className="text-white">{selectedTierData.reach}</span>
              </div>
              <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                <span className="text-white font-semibold">Total Cost:</span>
                <span className="text-white font-semibold">{selectedTierData.price} XLM</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('select')}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
              >
                Back
              </button>
              <button
                onClick={handlePayment}
                disabled={isProcessing}
                className="flex-1 bg-primary-blue hover:bg-primary-blue/80 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <MaterialIcon name="sync" className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <MaterialIcon name="payment" />
                    Confirm Payment
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center">
            <div className="mb-6">
              <MaterialIcon name="sync" className="text-4xl text-primary-blue mb-3 animate-spin" />
              <h4 className="text-lg font-semibold text-white mb-2">Processing Payment</h4>
              <p className="text-gray-400 text-sm">Please wait while we process your transaction...</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                <MaterialIcon name="lock" className="text-sm" />
                Locking funds in treasury...
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <MaterialIcon name="receipt" className="text-sm" />
                Creating blockchain transaction...
              </div>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center">
            <div className="mb-6">
              <MaterialIcon name="check_circle" className="text-4xl text-green-400 mb-3" />
              <h4 className="text-lg font-semibold text-white mb-2">Payment Successful!</h4>
              <p className="text-gray-400 text-sm">Your post promotion is now active</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <MaterialIcon name="campaign" className="text-sm" />
                Your post is now being promoted for {selectedTierData.duration} hours
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};