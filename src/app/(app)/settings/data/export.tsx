import * as Sharing from 'expo-sharing';
import { useState } from 'react';

import { ReauthPrompt } from '@/components/ReauthPrompt';
import { Button, ErrorText, Notice, Screen } from '@/components/ui';
import { exportMyData, type DataExport } from '@/data-rights/export-data';
import { useDb } from '@/db/DatabaseProvider';

/** F-04: JSON (tudo) + CSV (transações), cada um pelo seletor nativo. */
export default function ExportData() {
  const { db } = useDb();
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<DataExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!confirmed) {
    return (
      <Screen>
        <ReauthPrompt actionLabel="exportar seus dados" onConfirmed={() => setConfirmed(true)} />
      </Screen>
    );
  }

  const generate = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await exportMyData(db));
    } catch {
      setError('Não foi possível gerar os arquivos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Notice tone="warning" title="Arquivos sem criptografia">
        Contêm todas as suas transações em texto legível. Para guardar uma cópia segura, use o Backup.
      </Notice>
      <ErrorText>{error}</ErrorText>
      {!result ? (
        <Button title="Gerar JSON e CSV" icon="doc" onPress={generate} loading={busy} />
      ) : (
        <>
          <Notice tone="success">{result.transactions} transações exportadas.</Notice>
          <Button title="Compartilhar JSON" onPress={() => Sharing.shareAsync(result.json.uri, { mimeType: 'application/json', UTI: 'public.json' })} />
          <Button
            title="Compartilhar CSV"
            variant="secondary"
            onPress={() => Sharing.shareAsync(result.csv.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' })}
          />
        </>
      )}
    </Screen>
  );
}
