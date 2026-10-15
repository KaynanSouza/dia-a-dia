import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { bus } from '@/events/bus';
import { biometricCapability, promptBiometric } from '@/security/biometrics/biometrics';
import { hashPin, needsRehash, validatePin, verifyPin, type PinValidation } from '@/security/pin/pin-hash';
import { INITIAL_LOCK, lockReducer, type LockState } from './lock-machine';
import { lockStore, lockoutFor, type LockConfig } from './lock-store';

type AppLockApi = LockState & {
  setupPin(pin: string, enableBiometric: boolean): Promise<boolean>;
  unlockWithBiometrics(): Promise<boolean>;
  unlockWithPin(pin: string): Promise<boolean>;
  /** Reautenticação para ações sensíveis (apagar, backup); usa o mesmo contador de falhas. */
  confirmIdentity(pin?: string): Promise<boolean>;
  lock(): void;
  changePin(current: string, next: string): Promise<PinValidation | 'wrong_pin'>;
  setTimeoutMs(ms: number): Promise<void>;
  setBiometricEnabled(enabled: boolean): Promise<boolean>;
  /** Após "Apagar todos os dados": volta para o setup da 1ª abertura. */
  resetAfterWipe(): void;
};

const Ctx = createContext<AppLockApi | null>(null);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(lockReducer, INITIAL_LOCK);
  const configRef = useRef(state.config);
  configRef.current = state.config;
  const backgroundAt = useRef<number | null>(null);
  const promptOpen = useRef(false); // o prompt biométrico gera transições de AppState
  const pinMutex = useRef(false);

  // Boot: cold start sempre trava
  useEffect(() => {
    (async () => {
      const [pin, attempts, config, bio] = await Promise.all([
        lockStore.getPin(),
        lockStore.getAttempts(),
        lockStore.getConfig(),
        biometricCapability(),
      ]);
      dispatch({ type: 'BOOTED', hasPin: !!pin, attempts, config, biometricAvailable: bio.available });
      bus.emit('app.booted', { coldStart: true });
    })();
  }, []);

  // Timeout em background: timers JS não rodam em background, então compara timestamps na volta
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (promptOpen.current) return;
      if (next === 'background') {
        backgroundAt.current = Date.now();
      } else if (next === 'active' && backgroundAt.current !== null) {
        const elapsed = Date.now() - backgroundAt.current;
        backgroundAt.current = null;
        if (elapsed >= configRef.current.timeoutMs) {
          dispatch({ type: 'LOCK' });
          bus.emit('app.locked', { reason: 'background_timeout' });
        }
      }
    });
    return () => sub.remove();
  }, []);

  const withPrompt = useCallback(async (msg: string) => {
    promptOpen.current = true;
    try {
      return await promptBiometric(msg);
    } finally {
      promptOpen.current = false;
    }
  }, []);

  /** Lockout persistido ANTES de responder: matar o app não zera o contador. */
  const checkPin = useCallback(async (pin: string): Promise<boolean> => {
    if (pinMutex.current) return false;
    pinMutex.current = true;
    try {
      const attempts = await lockStore.getAttempts();
      if (attempts.lockoutUntil && Date.now() < attempts.lockoutUntil) {
        dispatch({ type: 'FAILED', attempts, error: 'locked_out' });
        return false;
      }
      dispatch({ type: 'BUSY' });
      const rec = await lockStore.getPin();
      if (rec && (await verifyPin(pin, rec))) {
        await lockStore.setAttempts({ failed: 0, lockoutUntil: null });
        if (needsRehash(rec)) await lockStore.setPin(await hashPin(pin));
        dispatch({ type: 'IDLE' });
        return true;
      }
      const failed = attempts.failed + 1;
      const wait = lockoutFor(failed);
      const next = { failed, lockoutUntil: wait ? Date.now() + wait : null };
      await lockStore.setAttempts(next);
      dispatch({ type: 'FAILED', attempts: next, error: wait ? 'locked_out' : 'wrong_pin' });
      bus.emit('lock.pin_failed', { attempts: failed, lockoutMs: wait });
      return false;
    } finally {
      pinMutex.current = false;
    }
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const ok = await checkPin(pin);
      if (ok) {
        dispatch({ type: 'UNLOCKED' });
        bus.emit('app.unlocked', { method: 'pin' });
      }
      return ok;
    },
    [checkPin],
  );

  const unlockWithBiometrics = useCallback(async () => {
    if (!configRef.current.biometricEnabled) return false;
    dispatch({ type: 'BUSY' });
    const ok = await withPrompt('Desbloquear Dia a Dia');
    if (ok) {
      await lockStore.setAttempts({ failed: 0, lockoutUntil: null }); // fator forte encerra o lockout do PIN
      dispatch({ type: 'UNLOCKED' });
      bus.emit('app.unlocked', { method: 'biometric' });
    } else {
      dispatch({ type: 'FAILED', attempts: await lockStore.getAttempts(), error: 'biometric_failed' });
    }
    return ok;
  }, [withPrompt]);

  const confirmIdentity = useCallback(
    async (pin?: string) => {
      if (pin !== undefined) return checkPin(pin);
      return configRef.current.biometricEnabled ? withPrompt('Confirme sua identidade') : false;
    },
    [checkPin, withPrompt],
  );

  const setupPin = useCallback(
    async (pin: string, enableBiometric: boolean) => {
      if (validatePin(pin) !== 'ok') {
        dispatch({ type: 'FAILED', attempts: { failed: 0, lockoutUntil: null }, error: 'weak_pin' });
        return false;
      }
      dispatch({ type: 'BUSY' });
      await lockStore.setPin(await hashPin(pin));
      const biometricEnabled =
        enableBiometric && (await biometricCapability()).available && (await withPrompt('Ativar biometria'));
      const config: LockConfig = { ...configRef.current, biometricEnabled };
      await Promise.all([lockStore.setConfig(config), lockStore.setAttempts({ failed: 0, lockoutUntil: null })]);
      dispatch({ type: 'SETUP_DONE', config });
      bus.emit('lock.configured', { biometric: biometricEnabled });
      return true;
    },
    [withPrompt],
  );

  const lock = useCallback(() => {
    dispatch({ type: 'LOCK' });
    bus.emit('app.locked', { reason: 'manual' });
  }, []);

  const changePin = useCallback(
    async (current: string, next: string) => {
      const v = validatePin(next);
      if (v !== 'ok') return v;
      if (!(await checkPin(current))) return 'wrong_pin' as const;
      await lockStore.setPin(await hashPin(next));
      return 'ok' as const;
    },
    [checkPin],
  );

  const saveConfig = useCallback(async (config: LockConfig) => {
    await lockStore.setConfig(config);
    dispatch({ type: 'CONFIG', config });
  }, []);

  const setTimeoutMs = useCallback((ms: number) => saveConfig({ ...configRef.current, timeoutMs: ms }), [saveConfig]);

  const setBiometricEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled && !(await withPrompt('Ativar biometria'))) return false;
      await saveConfig({ ...configRef.current, biometricEnabled: enabled });
      return true;
    },
    [saveConfig, withPrompt],
  );

  const resetAfterWipe = useCallback(() => dispatch({ type: 'RESET' }), []);

  const api = useMemo<AppLockApi>(
    () => ({
      ...state,
      setupPin,
      unlockWithBiometrics,
      unlockWithPin,
      confirmIdentity,
      lock,
      changePin,
      setTimeoutMs,
      setBiometricEnabled,
      resetAfterWipe,
    }),
    [state, setupPin, unlockWithBiometrics, unlockWithPin, confirmIdentity, lock, changePin, setTimeoutMs, setBiometricEnabled, resetAfterWipe],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAppLock() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppLock fora do AppLockProvider');
  return ctx;
}

/** Segundos restantes de lockout para a contagem regressiva da UI. */
export function useLockoutRemaining(lockoutUntil: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!lockoutUntil || lockoutUntil <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockoutUntil, now]);
  return lockoutUntil ? Math.max(0, Math.ceil((lockoutUntil - now) / 1000)) : 0;
}
