/**
 * UI tests for TwoFactorSetup (Setup_Wizard)
 * Feature: totp-two-factor-auth
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TwoFactorSetup from '../TwoFactorSetup';
import { twoFactorService } from '../../services/twoFactorService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../services/twoFactorService', () => ({
  twoFactorService: {
    isEnabled: jest.fn(),
    generateSecret: jest.fn(),
    verifyToken: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    generateRecoveryCodes: jest.fn(),
    storeRecoveryCodes: jest.fn(),
    regenerateRecoveryCodes: jest.fn(),
    verifyStoredToken: jest.fn(),
    verifyRecoveryCode: jest.fn(),
    resetFailedAttempts: jest.fn(),
  },
  TwoFactorUnavailableError: class TwoFactorUnavailableError extends Error {},
}));

jest.mock('../QRCodeDisplay', () => ({
  __esModule: true,
  default: ({ secret }: { secret: string }) => <div data-testid="qr-display">{secret}</div>,
}));

const mockSvc = twoFactorService as jest.Mocked<typeof twoFactorService>;

const defaultProps = {
  onSetupComplete: jest.fn(),
  onDisableComplete: jest.fn(),
  onCancel: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSvc.generateSecret.mockReturnValue({ secret: 'TESTSECRET', uri: 'otpauth://totp/SocialFlow:test?secret=TESTSECRET&issuer=SocialFlow' });
  mockSvc.generateRecoveryCodes.mockReturnValue(
    Array.from({ length: 8 }, (_, i) => ({ code: `CODE00000${i}`, consumed: false }))
  );
  mockSvc.storeRecoveryCodes.mockResolvedValue(undefined);
  mockSvc.enable.mockResolvedValue(undefined);
  mockSvc.disable.mockResolvedValue(undefined);
  mockSvc.regenerateRecoveryCodes.mockResolvedValue(
    Array.from({ length: 8 }, (_, i) => ({ code: `NEWCODE000${i}`, consumed: false }))
  );
});

describe('TwoFactorSetup', () => {

  test('shows Enable button when 2FA is disabled', () => {
    mockSvc.isEnabled.mockReturnValue(false);
    render(<TwoFactorSetup {...defaultProps} />);
    expect(screen.getByText('Enable Two-Factor Authentication')).toBeInTheDocument();
    expect(screen.queryByText('Disable Two-Factor Authentication')).not.toBeInTheDocument();
  });

  test('shows Disable button when 2FA is enabled', () => {
    mockSvc.isEnabled.mockReturnValue(true);
    render(<TwoFactorSetup {...defaultProps} />);
    expect(screen.getByText('Disable Two-Factor Authentication')).toBeInTheDocument();
    expect(screen.queryByText('Enable Two-Factor Authentication')).not.toBeInTheDocument();
  });

  test('clicking Enable shows QR code and secret', () => {
    mockSvc.isEnabled.mockReturnValue(false);
    render(<TwoFactorSetup {...defaultProps} />);
    fireEvent.click(screen.getByText('Enable Two-Factor Authentication'));
    expect(screen.getByTestId('qr-display')).toBeInTheDocument();
    expect(screen.getByText('TESTSECRET')).toBeInTheDocument();
  });

  test('shows error when invalid token submitted during setup', async () => {
    mockSvc.isEnabled.mockReturnValue(false);
    mockSvc.verifyToken.mockResolvedValue(false);
    render(<TwoFactorSetup {...defaultProps} />);
    fireEvent.click(screen.getByText('Enable Two-Factor Authentication'));
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(screen.getByText('Invalid code. Please try again.')).toBeInTheDocument());
  });

  test('does not regenerate secret on invalid token', async () => {
    mockSvc.isEnabled.mockReturnValue(false);
    mockSvc.verifyToken.mockResolvedValue(false);
    render(<TwoFactorSetup {...defaultProps} />);
    fireEvent.click(screen.getByText('Enable Two-Factor Authentication'));
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => screen.getByText('Invalid code. Please try again.'));
    expect(mockSvc.generateSecret).toHaveBeenCalledTimes(1);
  });

  test('shows recovery codes after valid token confirmation', async () => {
    mockSvc.isEnabled.mockReturnValue(false);
    mockSvc.verifyToken.mockResolvedValue(true);
    render(<TwoFactorSetup {...defaultProps} />);
    fireEvent.click(screen.getByText('Enable Two-Factor Authentication'));
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(screen.getByText('CODE000000')).toBeInTheDocument());
    expect(screen.getAllByText(/CODE0000\d/)).toHaveLength(8);
  });

  test('requires acknowledgement before completing setup', async () => {
    mockSvc.isEnabled.mockReturnValue(false);
    mockSvc.verifyToken.mockResolvedValue(true);
    render(<TwoFactorSetup {...defaultProps} />);
    fireEvent.click(screen.getByText('Enable Two-Factor Authentication'));
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => screen.getByText('CODE000000'));
    fireEvent.click(screen.getByText('Done'));
    expect(screen.getByText('Please confirm you have saved your recovery codes.')).toBeInTheDocument();
    expect(defaultProps.onSetupComplete).not.toHaveBeenCalled();
  });

  test('calls onSetupComplete after acknowledging codes', async () => {
    mockSvc.isEnabled.mockReturnValue(false);
    mockSvc.verifyToken.mockResolvedValue(true);
    render(<TwoFactorSetup {...defaultProps} />);
    fireEvent.click(screen.getByText('Enable Two-Factor Authentication'));
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => screen.getByText('CODE000000'));
    fireEvent.click(screen.getByLabelText('I have saved my recovery codes'));
    fireEvent.click(screen.getByText('Done'));
    expect(defaultProps.onSetupComplete).toHaveBeenCalled();
  });

  test('shows error when invalid token submitted during disable', async () => {
    mockSvc.isEnabled.mockReturnValue(true);
    mockSvc.verifyStoredToken.mockResolvedValue(false);
    mockSvc.verifyRecoveryCode.mockResolvedValue(false);
    render(<TwoFactorSetup {...defaultProps} />);
    fireEvent.click(screen.getByText('Disable Two-Factor Authentication'));
    fireEvent.change(screen.getByPlaceholderText('TOTP code or recovery code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByText('Disable 2FA'));
    await waitFor(() => expect(screen.getByText('Invalid code. 2FA has not been disabled.')).toBeInTheDocument());
    expect(mockSvc.disable).not.toHaveBeenCalled();
  });

  test('calls onDisableComplete after valid token during disable', async () => {
    mockSvc.isEnabled.mockReturnValue(true);
    mockSvc.verifyStoredToken.mockResolvedValue(true);
    render(<TwoFactorSetup {...defaultProps} />);
    fireEvent.click(screen.getByText('Disable Two-Factor Authentication'));
    fireEvent.change(screen.getByPlaceholderText('TOTP code or recovery code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Disable 2FA'));
    await waitFor(() => expect(defaultProps.onDisableComplete).toHaveBeenCalled());
  });

  test('calls onCancel when Cancel is clicked', () => {
    mockSvc.isEnabled.mockReturnValue(false);
    render(<TwoFactorSetup {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

});
