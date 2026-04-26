/**
 * UI tests for TwoFactorLogin (Login_Guard)
 * Feature: totp-two-factor-auth
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import TwoFactorLogin from '../TwoFactorLogin';
import { twoFactorService } from '../../services/twoFactorService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../services/twoFactorService', () => ({
  twoFactorService: {
    verifyStoredToken: jest.fn(),
    verifyRecoveryCode: jest.fn(),
    getRemainingRecoveryCodeCount: jest.fn(),
    recordFailedAttempt: jest.fn(),
    resetFailedAttempts: jest.fn(),
    isLockedOut: jest.fn(),
    getLockoutRemainingMs: jest.fn(),
    isEnabled: jest.fn(),
  },
  TwoFactorUnavailableError: class TwoFactorUnavailableError extends Error {},
}));

const mockSvc = twoFactorService as jest.Mocked<typeof twoFactorService>;

beforeEach(() => {
  jest.clearAllMocks();
  mockSvc.isLockedOut.mockReturnValue(false);
  mockSvc.getLockoutRemainingMs.mockReturnValue(0);
  mockSvc.getRemainingRecoveryCodeCount.mockResolvedValue(8);
});

describe('TwoFactorLogin', () => {

  test('renders TOTP input by default', () => {
    render(<TwoFactorLogin onSuccess={jest.fn()} />);
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
    expect(screen.getByText('Use a recovery code')).toBeInTheDocument();
  });

  test('calls onSuccess when valid TOTP token submitted', async () => {
    mockSvc.verifyStoredToken.mockResolvedValue(true);
    const onSuccess = jest.fn();
    render(<TwoFactorLogin onSuccess={onSuccess} />);
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockSvc.resetFailedAttempts).toHaveBeenCalled();
  });

  test('shows error and records failed attempt on invalid TOTP token', async () => {
    mockSvc.verifyStoredToken.mockResolvedValue(false);
    render(<TwoFactorLogin onSuccess={jest.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(screen.getByText('Invalid code. Please try again.')).toBeInTheDocument());
    expect(mockSvc.recordFailedAttempt).toHaveBeenCalled();
  });

  test('shows lockout message after 5 failures', async () => {
    mockSvc.verifyStoredToken.mockResolvedValue(false);
    mockSvc.recordFailedAttempt.mockImplementation(() => {
      mockSvc.isLockedOut.mockReturnValue(true);
      mockSvc.getLockoutRemainingMs.mockReturnValue(300_000);
    });
    render(<TwoFactorLogin onSuccess={jest.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(screen.getByText(/Too many failed attempts/)).toBeInTheDocument());
  });

  test('disables input when locked out', () => {
    mockSvc.isLockedOut.mockReturnValue(true);
    mockSvc.getLockoutRemainingMs.mockReturnValue(300_000);
    render(<TwoFactorLogin onSuccess={jest.fn()} />);
    expect(screen.getByPlaceholderText('6-digit code')).toBeDisabled();
    expect(screen.getByText(/Input locked/)).toBeInTheDocument();
  });

  test('switches to recovery code mode', () => {
    render(<TwoFactorLogin onSuccess={jest.fn()} />);
    fireEvent.click(screen.getByText('Use a recovery code'));
    expect(screen.getByPlaceholderText('Recovery code')).toBeInTheDocument();
    expect(screen.getByText('Use authenticator app')).toBeInTheDocument();
  });

  test('calls onSuccess when valid recovery code submitted', async () => {
    mockSvc.verifyRecoveryCode.mockResolvedValue(true);
    const onSuccess = jest.fn();
    render(<TwoFactorLogin onSuccess={onSuccess} />);
    fireEvent.click(screen.getByText('Use a recovery code'));
    fireEvent.change(screen.getByPlaceholderText('Recovery code'), { target: { value: 'ABCDE12345' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  test('shows all-codes-consumed message when no recovery codes remain', async () => {
    mockSvc.verifyRecoveryCode.mockResolvedValue(false);
    mockSvc.getRemainingRecoveryCodeCount.mockResolvedValue(0);
    render(<TwoFactorLogin onSuccess={jest.fn()} />);
    fireEvent.click(screen.getByText('Use a recovery code'));
    fireEvent.change(screen.getByPlaceholderText('Recovery code'), { target: { value: 'XXXXXXXXXX' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() =>
      expect(screen.getByText(/All recovery codes used/)).toBeInTheDocument()
    );
  });

  test('switches back to TOTP mode from recovery mode', () => {
    render(<TwoFactorLogin onSuccess={jest.fn()} />);
    fireEvent.click(screen.getByText('Use a recovery code'));
    fireEvent.click(screen.getByText('Use authenticator app'));
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
  });

});
