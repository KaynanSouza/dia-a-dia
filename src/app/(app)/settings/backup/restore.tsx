import type { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';

import { BACKUP_ERROR_MESSAGE, BackupError } from '@/backup/errors';
import { inspectBackup, pickBackupFile, restoreBackup } from '@/backup/restore-backup';
import { ReauthPrompt } from '@/components/ReauthPrompt';
import { Button, ErrorText, Field, Muted, Screen, Title } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';

const CONFIRM_WORD = 'SUBSTITUIR';
type Info = Awaited<ReturnType<typeof inspectBackup>>;

export default function RestoreBackup() {
  const { bump } = useDb();
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  const pick = async () => {
    setError(undefined);
    const f = await pickBackupFile();
    if (!f) return;
    try {
      setInfo(await inspectBackup(f));
      setFile(f);
    } catch (e) {
      setError(e instanceof BackupError ? BACKUP_ERROR_MESSAGE[e.code] : 'Arquivo inválido.');
    }
  };

  const run = async () => {
    if (!file) return;
    setError(undefined);
    setProgress(0);
    try {
      await restoreBackup(file, password, setProgress);
      bump();
      router.replace('/home');
    } catch (e) {
      setError(e instanceof BackupError ? BACKUP_ERROR_MESSAGE[e.code] : 'Não foi possível restaurar. Seus dados atuais foram mantidos.');
      setFile(null);
      setInfo(null);
    } finally {
      setPassword('');
      setProgress(null);
    }
  };

  if (!file || !info) {
    return (
      <Screen>
        <Muted>Escolha um arquivo .diabkp gerado pelo Dia a Dia.</Muted>
        <ErrorText>{error}</ErrorText>
        <Button title="Escolher arquivo" onPress={pick} />
      </Screen>
    );
  }

  if (!confirmed) {
    return (
      <Screen>
        <Title>Backup de {new Date(info.createdAt).toLocaleString('pt-BR')}</Title>
        <Muted>Versão do app: {info.appVersion} · schema v{info.schemaVersion}</Muted>
        {!info.compatible && <ErrorText>Este backup não é compatível com esta versão do app.</ErrorText>}
        {info.compatible && <ReauthPrompt actionLabel="restaurar o backup" onConfirmed={() => setConfirmed(true)} />}
      </Screen>
    );
  }

  return (
    <Screen>
      <Muted>Todos os dados atuais deste aparelho serão substituídos pelos do backup. Seu PIN e biometria continuam os mesmos.</Muted>
      <Field label="Senha do backup" value={password} onChangeText={setPassword} secureTextEntry autoComplete="off" />
      <Field label={`Digite ${CONFIRM_WORD} para confirmar`} value={word} onChangeText={setWord} autoCapitalize="characters" />
      {progress !== null && <Muted>Verificando senha… {Math.round(progress * 100)}%</Muted>}
      <ErrorText>{error}</ErrorText>
      <Button title="Restaurar" variant="danger" onPress={run} loading={progress !== null} disabled={!password || word !== CONFIRM_WORD} />
    </Screen>
  );
}
