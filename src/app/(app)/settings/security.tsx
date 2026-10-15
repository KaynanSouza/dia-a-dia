import { useState } from 'react';
import { Switch } from 'react-native';

import { Button, ErrorText, Group, ListItem, Notice, PinField, Screen, SectionTitle } from '@/components/ui';
import { useAppLock } from '@/security/lock/AppLockProvider';
import { TIMEOUT_OPTIONS } from '@/security/lock/lock-store';
import { useTheme } from '@/theme';

const CHANGE_MSG = { ok: 'PIN alterado.', wrong_pin: 'PIN atual incorreto.', weak: 'Novo PIN muito fácil.', format: 'O PIN deve ter 6 dígitos.' };

export default function Security() {
  const t = useTheme();
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
      {lock.biometricAvailable && (
        <Group>
          <ListItem
            icon="biometric"
            title="Biometria"
            subtitle="O PIN continua como alternativa"
            right={<Switch value={lock.config.biometricEnabled} onValueChange={(v) => void lock.setBiometricEnabled(v)} trackColor={{ true: t.primary }} />}
          />
        </Group>
      )}

      <Group title="Bloqueio automático" footer="Trava o app depois de ficar em segundo plano por esse tempo.">
        {TIMEOUT_OPTIONS.map((o) => (
          <ListItem key={o.ms} title={o.label} onPress={() => lock.setTimeoutMs(o.ms)} selected={lock.config.timeoutMs === o.ms} />
        ))}
      </Group>

      <SectionTitle>Trocar PIN</SectionTitle>
      <PinField label="PIN atual" value={current} onChange={setCurrent} />
      <PinField label="Novo PIN" value={next} onChange={setNext} />
      {msg === CHANGE_MSG.ok ? <Notice tone="success">{msg}</Notice> : <ErrorText>{msg}</ErrorText>}
      <Button title="Trocar PIN" icon="key" onPress={changePin} loading={lock.busy} disabled={current.length !== 6 || next.length !== 6} />
    </Screen>
  );
}
