import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Switch } from 'react-native';

import { Button, ErrorText, ListItem, Muted, PinField, Screen, Title } from '@/components/ui';
import { useAppLock } from '@/security/lock/AppLockProvider';
import { validatePin } from '@/security/pin/pin-hash';

/** F-01: primeira abertura. Sem e-mail, senha ou conta. */
export default function SetupPin() {
  const lock = useAppLock();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [bio, setBio] = useState(lock.biometricAvailable);
  const [error, setError] = useState<string>();

  if (lock.status !== 'setup') return <Redirect href="/" />;

  const submit = async () => {
    setError(undefined);
    const v = validatePin(pin);
    if (v === 'format') return setError('O PIN deve ter 6 dígitos.');
    if (v === 'weak') return setError('PIN muito fácil. Evite sequências e números repetidos.');
    if (pin !== confirm) return setError('Os PINs não conferem.');
    if (await lock.setupPin(pin, bio)) router.replace('/');
  };

  return (
    <Screen>
      <Title>Proteja suas finanças</Title>
      <Muted>Tudo fica só neste aparelho, criptografado. Crie um PIN de 6 dígitos para abrir o app.</Muted>
      <PinField label="PIN" value={pin} onChange={setPin} autoFocus />
      <PinField label="Confirmar PIN" value={confirm} onChange={setConfirm} />
      {lock.biometricAvailable && (
        <ListItem title="Desbloquear com biometria" subtitle="O PIN continua como alternativa" right={<Switch value={bio} onValueChange={setBio} />} />
      )}
      <ErrorText>{error}</ErrorText>
      <Button title="Continuar" onPress={submit} loading={lock.busy} disabled={pin.length !== 6 || confirm.length !== 6} />
      <Muted>Sem o PIN e sem backup não há como recuperar os dados: não existe conta nem servidor.</Muted>
    </Screen>
  );
}
