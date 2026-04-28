import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import crypto from 'crypto';

// ── Error types ──────────────────────────────────────────────────────────────

export class TwoFactorUnavailableError extends Error {
  constructor() { super('2FA not supported on this platform'); }
}
export class TwoFactorDecryptionError extends Error {
  constructor() { super('Failed to decrypt 2FA data'); }
}
export class TwoFactorLockedOutError extends Error {
  constructor(public remainingMs: number) { super('Too many failed attempts'); }
}

// ── otplib instance ───────────────────────────────────────────────────────────

const totpInstance = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

// ── Storage interfaces ────────────────────────────────────────────────────────

interface TwoFactorUserStore {
  twoFactorEnabled: boolean;
  encryptedSecret: string;   // base64(iv[12] + authTag[16] + ciphertext)
  encryptedKey: string;      // base64 of safeStorage output
}

interface RecoveryCodeEntry { hash: string; consumed: boolean; }
interface RecoveryCodeData  { codes: RecoveryCodeEntry[]; }
interface RecoveryCodeStore {
  encryptedCodes: string;
  encryptedKey: string;
}

// ── Rate-limit state (in-memory only) ────────────────────────────────────────

interface RateLimitState {
  failedAttempts: number;
  lockedUntil: number | null;
}

// ── Pluggable lockout store interface ────────────────────────────────────────

export interface TwoFactorLockoutStore {
  recordFailedAttempt(userId: string): Promise<void>;
  isLockedOut(userId: string): Promise<boolean>;
  getLockoutRemainingMs(userId: string): Promise<number>;
  resetFailedAttempts(userId: string): Promise<void>;
}

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;
const USER_STORE_KEY = 'sf_user_2fa';
const RECOVERY_STORE_KEY = 'sf_recovery_codes';

// ── IPC bridge (Electron safeStorage) ────────────────────────────────────────

function getElectronAPI() {
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  if (!w?.electronAPI?.encryptString || !w?.electronAPI?.decryptString) {
    throw new TwoFactorUnavailableError();
  }
  return w.electronAPI as {
    encryptString(plain: string): Promise<string>;
    decryptString(cipher: string): Promise<string>;
  };
}

// ── AES-256-GCM helpers ───────────────────────────────────────────────────────

function aesEncrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function aesDecrypt(blob: string, keyHex: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv  = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct  = buf.subarray(28);
  const key = Buffer.from(keyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ── Recovery code hashing (scrypt) ───────────────────────────────────────────

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

function hashRecoveryCode(plainCode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(plainCode, salt, SCRYPT_PARAMS.keylen, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p }, (err, derived) => {
      if (err) return reject(err);
      resolve(`${salt.toString('hex')}:${derived.toString('hex')}`);
    });
  });
}

function checkRecoveryCode(plainCode: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) return resolve(false);
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    crypto.scrypt(plainCode, salt, SCRYPT_PARAMS.keylen, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p }, (err, derived) => {
      if (err) return reject(err);
      resolve(derived.length === expected.length && crypto.timingSafeEqual(derived, expected));
    });
  });
}

// ── twoFactorService ──────────────────────────────────────────────────────────

const rateLimitState: RateLimitState = { failedAttempts: 0, lockedUntil: null };

// Track last used token per window to prevent replay attacks
let lastUsedToken: string | null = null;
let lastUsedTokenTime: number = 0;

export const twoFactorService = {

  // ── Lockout store (pluggable — defaults to in-memory) ───────────────────────

  _lockoutStore: null as TwoFactorLockoutStore | null,

  setLockoutStore(store: TwoFactorLockoutStore): void {
    twoFactorService._lockoutStore = store;
  },

  // ── Secret lifecycle ────────────────────────────────────────────────────────

  generateSecret(accountLabel: string): { secret: string; uri: string } {
    const secret = totpInstance.generateSecret(20); // 20 bytes = 160 bits
    const uri = totpInstance.toURI({ secret, label: accountLabel, issuer: 'SocialFlow' });
    return { secret, uri };
  },

  async verifyToken(secret: string, token: string): Promise<boolean> {
    try {
      const result = await totpInstance.verify(token, { secret, epochTolerance: 30 });
      return result.valid;
    } catch {
      return false;
    }
  },

  async verifyStoredToken(token: string): Promise<boolean> {
    try {
      const store = twoFactorService._readUserStore();
      if (!store?.twoFactorEnabled) return false;

      const api = getElectronAPI();
      const keyHex = await api.decryptString(store.encryptedKey);
      const secret = aesDecrypt(store.encryptedSecret, keyHex);

      // Replay attack prevention: reject token if already used in current window
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - (now % 30);
      if (token === lastUsedToken && lastUsedTokenTime >= windowStart) return false;

      const valid = await twoFactorService.verifyToken(secret, token);
      if (valid) {
        lastUsedToken = token;
        lastUsedTokenTime = now;
      }
      return valid;
    } catch (e) {
      if (e instanceof TwoFactorUnavailableError) throw e;
      console.error('verifyStoredToken error:', e);
      return false;
    }
  },

  // ── Enable / disable ────────────────────────────────────────────────────────

  async enable(secret: string): Promise<void> {
    const api = getElectronAPI();
    const keyHex = crypto.randomBytes(32).toString('hex');
    const encryptedKey = await api.encryptString(keyHex);
    const encryptedSecret = aesEncrypt(secret, keyHex);
    const store: TwoFactorUserStore = { twoFactorEnabled: true, encryptedSecret, encryptedKey };
    localStorage.setItem(USER_STORE_KEY, JSON.stringify(store));
  },

  async disable(): Promise<void> {
    localStorage.setItem(USER_STORE_KEY, JSON.stringify({ twoFactorEnabled: false, encryptedSecret: '', encryptedKey: '' }));
    localStorage.removeItem(RECOVERY_STORE_KEY);
    lastUsedToken = null;
    lastUsedTokenTime = 0;
    twoFactorService.resetFailedAttempts();
  },

  isEnabled(): boolean {
    try {
      const store = twoFactorService._readUserStore();
      return store?.twoFactorEnabled === true;
    } catch {
      return false;
    }
  },

  // ── Recovery codes ──────────────────────────────────────────────────────────

  generateRecoveryCodes(): string[] {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 8 }, () =>
      Array.from(crypto.randomBytes(10))
        .map(b => chars[b % chars.length])
        .join('')
    );
  },

  async storeRecoveryCodes(plainCodes: string[]): Promise<void> {
    const api = getElectronAPI();
    const keyHex = crypto.randomBytes(32).toString('hex');
    const encryptedKey = await api.encryptString(keyHex);
    const codes: RecoveryCodeEntry[] = await Promise.all(
      plainCodes.map(async code => ({ hash: await hashRecoveryCode(code), consumed: false }))
    );
    const encryptedCodes = aesEncrypt(JSON.stringify({ codes } as RecoveryCodeData), keyHex);
    const store: RecoveryCodeStore = { encryptedCodes, encryptedKey };
    localStorage.setItem(RECOVERY_STORE_KEY, JSON.stringify(store));
  },

  async verifyRecoveryCode(code: string): Promise<boolean> {
    try {
      const api = getElectronAPI();
      const raw = localStorage.getItem(RECOVERY_STORE_KEY);
      if (!raw) return false;
      const store: RecoveryCodeStore = JSON.parse(raw);
      const keyHex = await api.decryptString(store.encryptedKey);
      const data: RecoveryCodeData = JSON.parse(aesDecrypt(store.encryptedCodes, keyHex));
      // Find first unconsumed entry whose hash matches
      let matchedIndex = -1;
      for (let i = 0; i < data.codes.length; i++) {
        const entry = data.codes[i];
        if (!entry.consumed && await checkRecoveryCode(code, entry.hash)) {
          matchedIndex = i;
          break;
        }
      }
      if (matchedIndex === -1) return false;
      data.codes[matchedIndex].consumed = true;
      const newEncrypted = aesEncrypt(JSON.stringify(data), keyHex);
      localStorage.setItem(RECOVERY_STORE_KEY, JSON.stringify({ encryptedCodes: newEncrypted, encryptedKey: store.encryptedKey }));
      return true;
    } catch {
      return false;
    }
  },

  async regenerateRecoveryCodes(): Promise<string[]> {
    const codes = twoFactorService.generateRecoveryCodes();
    await twoFactorService.storeRecoveryCodes(codes);
    return codes;
  },

  async getRemainingRecoveryCodeCount(): Promise<number> {
    try {
      const api = getElectronAPI();
      const raw = localStorage.getItem(RECOVERY_STORE_KEY);
      if (!raw) return 0;
      const store: RecoveryCodeStore = JSON.parse(raw);
      const keyHex = await api.decryptString(store.encryptedKey);
      const data: RecoveryCodeData = JSON.parse(aesDecrypt(store.encryptedCodes, keyHex));
      return data.codes.filter(c => !c.consumed).length;
    } catch {
      return 0;
    }
  },

  // ── Rate limiting ───────────────────────────────────────────────────────────

  recordFailedAttempt(userId?: string): void {
    if (twoFactorService._lockoutStore && userId) {
      void twoFactorService._lockoutStore.recordFailedAttempt(userId);
      return;
    }
    rateLimitState.failedAttempts += 1;
    if (rateLimitState.failedAttempts >= LOCKOUT_THRESHOLD) {
      rateLimitState.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
  },

  isLockedOut(userId?: string): boolean {
    if (twoFactorService._lockoutStore && userId) {
      // Synchronous callers fall back to in-memory; async callers should use the store directly
      return false;
    }
    if (rateLimitState.lockedUntil === null) return false;
    if (Date.now() >= rateLimitState.lockedUntil) {
      rateLimitState.lockedUntil = null;
      rateLimitState.failedAttempts = 0;
      return false;
    }
    return true;
  },

  getLockoutRemainingMs(userId?: string): number {
    if (twoFactorService._lockoutStore && userId) {
      return 0; // async callers should use the store directly
    }
    if (rateLimitState.lockedUntil === null) return 0;
    return Math.max(0, rateLimitState.lockedUntil - Date.now());
  },

  resetFailedAttempts(userId?: string): void {
    if (twoFactorService._lockoutStore && userId) {
      void twoFactorService._lockoutStore.resetFailedAttempts(userId);
      return;
    }
    rateLimitState.failedAttempts = 0;
    rateLimitState.lockedUntil = null;
  },

  // ── Internal helpers ────────────────────────────────────────────────────────

  _readUserStore(): TwoFactorUserStore | null {
    try {
      const raw = localStorage.getItem(USER_STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      console.error('Failed to read 2FA user store');
      return null;
    }
  },
};
