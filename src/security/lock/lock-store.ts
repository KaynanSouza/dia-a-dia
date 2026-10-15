import { secureKv } from '@/security/keystore/secure-kv';
import type { PinRecord } from '@/security/pin/pin-hash';

export const LOCK_KEYS = { pin: 'lock.pin.v1', attempts: 'lock.attempts.v1', config: 'lock.config.v1' } as const;

export type LockConfig = { biometricEnabled: boolean; timeoutMs: number };
export type Attempts = { failed: number; lockoutUntil: number | null };

export const DEFAULT_CONFIG: LockConfig = { biometricEnabled: false, timeoutMs: 60_000 };

export const TIMEOUT_OPTIONS = [
  { ms: 0, label: 'Imediatamente' },
  { ms: 30_000, label: '30 segundos' },
  { ms: 60_000, label: '1 minuto' },
  { ms: 5 * 60_000, label: '5 minutos' },
  { ms: 15 * 60_000, label: '15 minutos' },
] as const;

export const FREE_ATTEMPTS = 5;
const STEPS_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];

/** 5ª falha → 30 s, 6ª → 1 min, 7ª → 5 min … teto de 1 h. */
export const lockoutFor = (failed: number) =>
  failed < FREE_ATTEMPTS ? 0 : STEPS_MS[Math.min(failed - FREE_ATTEMPTS, STEPS_MS.length - 1)];

export const lockStore = {
  getPin: () => secureKv.getJson<PinRecord | null>(LOCK_KEYS.pin, null),
  setPin: (r: PinRecord) => secureKv.setJson(LOCK_KEYS.pin, r),
  getAttempts: () => secureKv.getJson<Attempts>(LOCK_KEYS.attempts, { failed: 0, lockoutUntil: null }),
  setAttempts: (a: Attempts) => secureKv.setJson(LOCK_KEYS.attempts, a),
  getConfig: async (): Promise<LockConfig> => ({ ...DEFAULT_CONFIG, ...(await secureKv.getJson<Partial<LockConfig>>(LOCK_KEYS.config, {})) }),
  setConfig: (c: LockConfig) => secureKv.setJson(LOCK_KEYS.config, c),
  clear: () => Promise.all(Object.values(LOCK_KEYS).map((k) => secureKv.del(k))),
};
