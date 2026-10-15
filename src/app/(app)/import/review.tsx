import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Button, ErrorText, ListItem, Muted, Screen, Title, formatCents, formatDate } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { commitImport, discardImport, getPreview } from '@/import/import-file';

const PREVIEW_ROWS = 30;

export default function ImportReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, bump } = useDb();
  const preview = getPreview(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const committed = useRef(false);

  // Sair sem confirmar descarta o CSV
  useEffect(() => () => {
    if (!committed.current) discardImport(id);
  }, [id]);

  if (!preview) {
    return (
      <Screen>
        <ErrorText>Esta importação expirou. Escolha o arquivo novamente.</ErrorText>
        <Button title="Voltar" onPress={() => router.back()} />
      </Screen>
    );
  }

  const confirm = async () => {
    setBusy(true);
    try {
      committed.current = true;
      await commitImport(db, id);
      bump();
      router.replace('/transactions');
    } catch {
      committed.current = false;
      setError('Falha ao gravar a importação. Nada foi alterado.');
    } finally {
      setBusy(false);
    }
  };

  const total = preview.rows.reduce((s, r) => s + r.amountCents, 0);

  return (
    <Screen>
      <Title>{preview.rows.length} novas transações</Title>
      <Muted>
        {preview.duplicates} duplicada(s) ignorada(s) · {preview.errors.length} linha(s) com erro · soma {formatCents(total)}
      </Muted>
      {preview.alreadyImported && <Muted>Este mesmo arquivo já foi importado antes; só o que é novo será gravado.</Muted>}
      {preview.rows.slice(0, PREVIEW_ROWS).map((r) => (
        <ListItem key={r.fingerprint} title={r.description} subtitle={formatDate(r.postedOn)} right={<Muted>{formatCents(r.amountCents)}</Muted>} />
      ))}
      {preview.rows.length > PREVIEW_ROWS && <Muted>… e mais {preview.rows.length - PREVIEW_ROWS}.</Muted>}
      {preview.errors.length > 0 && (
        <Muted>Linhas ignoradas: {preview.errors.slice(0, 10).map((e) => e.line).join(', ')}{preview.errors.length > 10 ? '…' : ''}</Muted>
      )}
      <ErrorText>{error}</ErrorText>
      <Button title="Importar" onPress={confirm} loading={busy} disabled={!preview.rows.length} />
      <Button title="Cancelar" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
