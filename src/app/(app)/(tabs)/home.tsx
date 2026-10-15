import { router } from 'expo-router';

import { Button, ListItem, Loading, Muted, Screen, Title, formatCents } from '@/components/ui';
import { useDbQuery } from '@/db/DatabaseProvider';
import { ACCOUNT_KIND_LABEL, listAccounts } from '@/db/repositories/finance.repo';
import { maskDigits } from '@/security/privacy/mask';

export default function Home() {
  const { data: accounts, loading } = useDbQuery(listAccounts);
  if (loading && !accounts) return <Loading />;

  const total = (accounts ?? []).reduce((s, a) => s + a.balance_cents, 0);

  return (
    <Screen>
      <Title>{formatCents(total)}</Title>
      <Muted>Saldo somado das transações importadas</Muted>
      {accounts?.map((a) => (
        <ListItem
          key={a.id}
          title={a.name}
          subtitle={[ACCOUNT_KIND_LABEL[a.kind], a.institution, maskDigits(a.number_last4)].filter(Boolean).join(' · ')}
          right={<Muted>{formatCents(a.balance_cents)}</Muted>}
        />
      ))}
      {!accounts?.length && <Muted>Nenhuma conta ainda. Crie uma para importar seus extratos.</Muted>}
      <Button title="Nova conta" variant="secondary" onPress={() => router.push('/accounts/new')} />
    </Screen>
  );
}
