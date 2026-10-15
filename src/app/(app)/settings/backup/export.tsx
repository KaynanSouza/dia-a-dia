import { router } from 'expo-router';
import { useState } from 'react';

import { ReauthPrompt } from '@/components/ReauthPrompt';
import { ProgressBar } from '@/components/charts';
import { Button, ErrorText, Field, Muted, Notice, Screen } from '@/components/ui';
import { BACKUP_ERROR_MESSAGE, BackupError } from '@/backup/errors';
import { exportBackup, type BackupProgress } from '@/backup/export-backup';
import { MIN_PASSWORD } from '@/backup/kdf';

const STAGE: Record<BackupProgress['stage'], string> = {
  snapshot: 'Copiando dados…',
  kdf: 'Protegendo com sua senha…',
  encrypt: 'Criptografando…',
  share: 'Escolha onde salvar…',
};

export default function ExportBackup() {
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [error, setError] = useState<string>();

  if (!confirmed) {
    return (
      <Screen>
        <ReauthPrompt actionLabel="fazer o backup" onConfirmed={() => setConfirmed(true)} />
      </Screen>
    );
  }

  const run = async () => {
    setError(undefined);
    try {
      await exportBackup(password, setProgress);
      setPassword('');
      setRepeat('');
      router.back();
    } catch (e) {
      setError(e instanceof BackupError ? BACKUP_ERROR_MESSAGE[e.code] : 'Não foi possível gerar o backup.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Screen>
      <Muted>Crie uma senha para este backup (mínimo {MIN_PASSWORD} caracteres). Uma frase longa é o ideal.</Muted>
      <Field label="Senha do backup" value={password} onChangeText={setPassword} secureTextEntry autoComplete="off" />
      <Field label="Repita a senha" value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="off" />
      <Notice tone="warning">Sem esta senha o backup é irrecuperável. Não existe "esqueci minha senha".</Notice>
      {progress &&
        (progress.stage === 'kdf' && progress.kdf !== undefined ? (
          <ProgressBar ratio={progress.kdf} label={STAGE.kdf} />
        ) : (
          <Muted>{STAGE[progress.stage]}</Muted>
        ))}
      <ErrorText>{error}</ErrorText>
      <Button
        title="Gerar backup"
        icon="lock"
        onPress={run}
        loading={!!progress}
        disabled={password.normalize('NFKC').length < MIN_PASSWORD || password !== repeat}
      />
    </Screen>
  );
}
