import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Button, ErrorText, Muted, PinField, Screen, Title } from '@/components/ui';
import { useAppLock, useLockoutRemaining } from '@/security/lock/AppLockProvider';
import { FREE_ATTEMPTS } from '@/security/lock/lock-store';

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s` : `${s}s`);

export default function Unlock() {
  const lock = useAppLock();
  const [pin, setPin] = useState('');
  const remaining = useLockoutRemaining(lock.lockoutUntil);
  const autoPrompted = useRef(false);

  // Biometria automática ao abrir a tela (uma vez)
  useEffect(() => {
    if (lock.status === 'locked' && lock.config.biometricEnabled && !autoPrompted.current) {
      autoPrompted.current = true;
      lock.unlockWithBiometrics();
    }
  }, [lock]);

  // Envia sozinho ao completar 6 dígitos (limpa antes para nunca contar a mesma tentativa duas vezes)
  useEffect(() => {
    if (pin.length === 6 && remaining === 0 && !lock.busy) {
      setPin('');
      lock.unlockWithPin(pin);
    }
  }, [pin, remaining, lock]);

  if (lock.status !== 'locked') return <Redirect href="/" />;

  const left = FREE_ATTEMPTS - lock.failed;

  return (
    <Screen>
      <Title>Dia a Dia</Title>
      <Muted>Digite seu PIN para continuar.</Muted>
      <PinField label="PIN" value={pin} onChange={setPin} autoFocus={!lock.config.biometricEnabled} />
      {remaining > 0 ? (
        <ErrorText>Muitas tentativas incorretas. Tente novamente em {fmt(remaining)}.</ErrorText>
      ) : lock.error === 'wrong_pin' ? (
        <ErrorText>PIN incorreto.{left > 0 && left <= 3 ? ` ${left} tentativa(s) antes do bloqueio temporário.` : ''}</ErrorText>
      ) : lock.error === 'biometric_failed' ? (
        <ErrorText>Biometria não reconhecida. Use o PIN.</ErrorText>
      ) : null}
      {lock.config.biometricEnabled && (
        <Button title="Usar biometria" variant="secondary" onPress={() => lock.unlockWithBiometrics()} disabled={lock.busy} />
      )}
    </Screen>
  );
}
