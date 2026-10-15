import { DEFAULT_CONFIG, type Attempts, type LockConfig } from './lock-store';

export type LockStatus = 'booting' | 'setup' | 'locked' | 'unlocked';
export type LockError = 'wrong_pin' | 'locked_out' | 'biometric_failed' | 'weak_pin' | null;

export type LockState = {
  status: LockStatus;
  failed: number;
  lockoutUntil: number | null;
  busy: boolean;
  biometricAvailable: boolean;
  config: LockConfig;
  error: LockError;
};

export type LockAction =
  | { type: 'BOOTED'; hasPin: boolean; attempts: Attempts; config: LockConfig; biometricAvailable: boolean }
  | { type: 'BUSY' }
  | { type: 'IDLE' }
  | { type: 'SETUP_DONE'; config: LockConfig }
  | { type: 'UNLOCKED' }
  | { type: 'FAILED'; attempts: Attempts; error: Exclude<LockError, null> }
  | { type: 'LOCK' }
  | { type: 'RESET' }
  | { type: 'CONFIG'; config: LockConfig };

export const INITIAL_LOCK: LockState = {
  status: 'booting',
  failed: 0,
  lockoutUntil: null,
  busy: false,
  biometricAvailable: false,
  config: DEFAULT_CONFIG,
  error: null,
};

/** booting → setup | locked;  setup → unlocked;  locked ⇄ unlocked;  * → setup (RESET após wipe) */
export function lockReducer(s: LockState, a: LockAction): LockState {
  switch (a.type) {
    case 'BOOTED':
      return {
        ...s,
        status: a.hasPin ? 'locked' : 'setup',
        ...a.attempts,
        config: a.config,
        biometricAvailable: a.biometricAvailable,
      };
    case 'BUSY':
      return { ...s, busy: true, error: null };
    case 'IDLE':
      return { ...s, busy: false };
    case 'SETUP_DONE':
      return { ...s, status: 'unlocked', busy: false, failed: 0, lockoutUntil: null, config: a.config, error: null };
    case 'UNLOCKED':
      return s.status === 'setup' ? s : { ...s, status: 'unlocked', busy: false, failed: 0, lockoutUntil: null, error: null };
    case 'FAILED':
      return { ...s, busy: false, ...a.attempts, error: a.error };
    case 'LOCK':
      return s.status === 'unlocked' ? { ...s, status: 'locked', busy: false, error: null } : s;
    case 'RESET':
      return { ...INITIAL_LOCK, status: 'setup', biometricAvailable: s.biometricAvailable };
    case 'CONFIG':
      return { ...s, config: a.config };
  }
}
