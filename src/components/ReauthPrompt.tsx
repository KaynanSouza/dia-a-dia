import { useState } from 'react';

import { useAppLock, useLockoutRemaining } from '@/security/lock/AppLockProvider';
import { Button, ErrorText, Muted, PinField } from './ui';

/** Reautenticação (biometria ou PIN) antes de ações sensíveis: backup, restaurar, apagar. */
export function ReauthPrompt({ onConfirmed, actionLabel }: { onConfirmed: () => void; actionLabel: string }) {
  const lock = useAppLock();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();
  const remaining = useLockoutRemaining(lock.lockoutUntil);

  const withBiometrics = async () => {
    if (await lock.confirmIdentity()) onConfirmed();
    else setError('Biometria não confirmada. Use o PIN.');
  };

  const withPin = async () => {
    setError(undefined);
    if (await lock.confirmIdentity(pin)) onConfirmed();
    else setError('PIN incorreto.');
    setPin('');
  };

  return (
    <>
      <Muted>Confirme sua identidade para {actionLabel}.</Muted>
      {lock.config.biometricEnabled && <Button title="Usar biometria" variant="secondary" onPress={withBiometrics} />}
      <PinField label="PIN" value={pin} onChange={setPin} />
      {remaining > 0 ? <ErrorText>Muitas tentativas. Aguarde {remaining}s.</ErrorText> : <ErrorText>{error}</ErrorText>}
      <Button title="Confirmar" onPress={withPin} disabled={pin.length !== 6 || remaining > 0} loading={lock.busy} />
    </>
  );
}
