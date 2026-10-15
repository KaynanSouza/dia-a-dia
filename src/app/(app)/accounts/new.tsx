import { router } from 'expo-router';
import { useState } from 'react';

import type { IconName } from '@/components/Icon';
import { Button, ErrorText, Field, Group, ListItem, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { ACCOUNT_KIND_LABEL, createAccount, type AccountKind } from '@/db/repositories/finance.repo';

const KIND_ICON: Record<AccountKind, IconName> = { checking: 'bank', savings: 'income', credit_card: 'card', cash: 'cash', investment: 'chart' };

export default function NewAccount() {
  const { db, bump } = useDb();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('checking');
  const [institution, setInstitution] = useState('');
  const [last4, setLast4] = useState('');
  const [error, setError] = useState<string>();

  const save = async () => {
    try {
      await createAccount(db, { name, kind, institution, numberLast4: last4 || undefined });
      bump();
      router.back();
    } catch {
      setError('Não foi possível criar a conta.');
    }
  };

  return (
    <Screen>
      <Field label="Nome" value={name} onChangeText={setName} autoCapitalize="words" maxLength={60} />
      <Group title="Tipo">
        {(Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((k) => (
          <ListItem key={k} icon={KIND_ICON[k]} title={ACCOUNT_KIND_LABEL[k]} onPress={() => setKind(k)} selected={kind === k} />
        ))}
      </Group>
      <Field label="Banco (opcional)" value={institution} onChangeText={setInstitution} autoCapitalize="words" maxLength={60} />
      <Field
        label="4 últimos dígitos (opcional)"
        value={last4}
        onChangeText={(t) => setLast4(t.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        hint="Guardamos apenas os 4 últimos dígitos, nunca o número completo."
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Criar conta" icon="check" onPress={save} disabled={!name.trim() || (last4.length > 0 && last4.length !== 4)} />
    </Screen>
  );
}
