/**
 * 2FA Lockout Store initialization (#610)
 * Initializes the twoFactorService to use Redis-backed lockout store
 * This ensures lockout state persists across server restarts
 */

import { twoFactorService } from '../../../src/services/twoFactorService';
import { redisTwoFactorLockoutStore } from './TwoFactorLockoutService';
import { createLogger } from '../lib/logger';

const logger = createLogger('2fa-init');

/**
 * Initialize 2FA lockout with Redis store
 * Call this during server startup to ensure persistent lockout state
 */
export const initialize2FaLockoutStore = (): void => {
  try {
    twoFactorService.setLockoutStore(redisTwoFactorLockoutStore);
    logger.info('Initialized 2FA lockout store with Redis backend');
  } catch (error) {
    logger.error('Failed to initialize 2FA lockout store', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
