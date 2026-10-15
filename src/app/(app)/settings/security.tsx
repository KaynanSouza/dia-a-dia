import { useState } from 'react';
import { Switch } from 'react-native';

import { Button, ErrorText, ListItem, Muted, PinField, Screen, Title } from '@/components/ui';
import { useAppLock } from '@/security/lock/AppLockProvider';
import { TIMEOUT_OPTIONS } from '@/security/lock/lock-store';

const CHANGE_MSG = { ok: 'PIN alterado.', wrong_pin: 'PIN atual incorreto.', weak: 'Novo PIN muito fácil.', format: 'O PIN deve ter 6 dígitos.' };

export default function Security() {
  const lock = useAppLock();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<string>();

  const changePin = async () => {
    const r = await lock.changePin(current, next);
    setMsg(CHANGE_MSG[r]);
    setCurrent('');
    setNext('');
  };

  return (
    <Screen>
      <Title>Bloqueio automático</Title>
      <Muted>Trava o app depois de ficar em segundo plano por:</Muted>
      {TIMEOUT_OPTIONS.map((o) => (
        <ListItem
          key={o.ms}
          title={o.label}
          onPress={() => lock.setTimeoutMs(o.ms)}
          right={lock.config.timeoutMs === o.ms ? <Muted>✓</Muted> : null}
        />
      ))}

      {lock.biometricAvailable && (
        <ListItem
          title="Biometria"
          subtitle="PIN continua como alternativa"
          right={<Switch value={lock.config.biometricEnabled} onValueChange={(v) => void lock.setBiometricEnabled(v)} />}
        />
      )}

      <Title>Trocar PIN</Title>
      <PinField label="PIN atual" value={current} onChange={setCurrent} />
      <PinField label="Novo PIN" value={next} onChange={setNext} />
      {msg === CHANGE_MSG.ok ? <Muted>{msg}</Muted> : <ErrorText>{msg}</ErrorText>}
      <Button title="Trocar PIN" onPress={changePin} loading={lock.busy} disabled={current.length !== 6 || next.length !== 6} />
    </Screen>
  );
}
