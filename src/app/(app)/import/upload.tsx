import { router } from 'expo-router';
import { useState } from 'react';

import type { IconName } from '@/components/Icon';
import { Button, EmptyState, ErrorText, Group, ListItem, Loading, Notice, Screen, Steps } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { ACCOUNT_KIND_LABEL, listAccounts, type AccountKind } from '@/db/repositories/finance.repo';
import { errorDetail, IMPORT_ERROR_MESSAGE, ImportError } from '@/import/limits';
import { startSession } from '@/import/session';
import { IMPORT_STEPS } from '@/import/steps';
import { logError } from '@/logging/logger';
import { maskDigits } from '@/security/privacy/mask';

const KIND_ICON: Record<AccountKind, IconName> = { checking: 'bank', savings: 'income', credit_card: 'card', cash: 'cash', investment: 'chart' };

/** Passo 1/4: conta de destino + arquivo (seletor do sistema). */
export default function Upload() {
  const { db } = useDb();
  const { data: accounts, loading } = useDbQuery(listAccounts);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (loading && !accounts) return <Loading />;
  const selected = accountId ?? accounts?.[0]?.id ?? null;

  const pick = async () => {
    if (!selected) return;
    setBusy(true);
    setError(undefined);
    try {
      const session = await startSession(db, selected);
      if (session) router.push('/import/mapping');
    } catch (e) {
      if (e instanceof ImportError) setError(IMPORT_ERROR_MESSAGE[e.code] + (e.detail ? `\n(Detalhe: ${e.detail})` : ''));
      else {
        logError('import.upload', e);
        setError(`Não foi possível ler o arquivo. (${errorDetail(e)})`);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!accounts?.length) {
    return (
      <Screen>
        <Steps current={1} labels={IMPORT_STEPS} />
        <EmptyState
          icon="wallet"
          title="Crie sua primeira conta"
          text="As transações importadas ficam ligadas a uma conta corrente ou cartão."
          action={<Button title="Nova conta" icon="plus" onPress={() => router.push('/accounts/new')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Steps current={1} labels={IMPORT_STEPS} />
      <Group title="Para qual conta?">
        {accounts.map((a) => (
          <ListItem
            key={a.id}
            icon={KIND_ICON[a.kind] ?? 'bank'}
            title={a.name}
            subtitle={[ACCOUNT_KIND_LABEL[a.kind], maskDigits(a.number_last4)].filter(Boolean).join(' · ')}
            onPress={() => setAccountId(a.id)}
            selected={selected === a.id}
          />
        ))}
        <ListItem icon="plus" iconColor="#10B981" title="Nova conta" onPress={() => router.push('/accounts/new')} />
      </Group>

      <Notice tone="info" title="CSV de qualquer lugar">
        Downloads, Drive, WhatsApp ou anexo de e-mail. Nubank, Itaú, Bradesco, BB, Caixa, Inter e outros. Até 10 MB / 50 mil linhas.
      </Notice>
      <ErrorText>{error}</ErrorText>
      <Button title="Escolher arquivo" icon="doc" onPress={pick} loading={busy} />
    </Screen>
  );
}
