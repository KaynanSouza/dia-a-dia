import { router } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, ListItem, Loading, Muted, Screen, Title } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { listAccounts } from '@/db/repositories/finance.repo';
import { ImportError, prepareImport } from '@/import/import-file';
import { maskDigits } from '@/security/privacy/mask';

const IMPORT_ERROR: Record<ImportError['code'], string> = {
  too_large: 'Arquivo grande demais (máx. 10 MB).',
  empty: 'O arquivo está vazio.',
  unknown_layout: 'Não reconhecemos as colunas. O CSV precisa ter data, descrição e valor (ou débito/crédito).',
  encoding: 'Não foi possível ler o arquivo.',
};

/** F-07: importação 100% local (funciona em modo avião). */
export default function Import() {
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
      const preview = await prepareImport(db, selected);
      if (preview) router.push({ pathname: '/import/review', params: { id: preview.id } });
    } catch (e) {
      setError(e instanceof ImportError ? IMPORT_ERROR[e.code] : 'Falha ao ler o arquivo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Importar extrato</Title>
      {!accounts?.length ? (
        <>
          <Muted>Crie uma conta antes de importar.</Muted>
          <Button title="Nova conta" onPress={() => router.push('/accounts/new')} />
        </>
      ) : (
        <>
          <Muted>Escolha a conta de destino:</Muted>
          {accounts.map((a) => (
            <ListItem
              key={a.id}
              title={a.name}
              subtitle={maskDigits(a.number_last4) || undefined}
              onPress={() => setAccountId(a.id)}
              right={selected === a.id ? <Muted>✓</Muted> : null}
            />
          ))}
          <ErrorText>{error}</ErrorText>
          <Button title="Escolher arquivo CSV" onPress={pick} loading={busy} />
          <Muted>O arquivo é lido só no aparelho e descartado depois da importação.</Muted>
        </>
      )}
    </Screen>
  );
}
