import { useState } from 'react';

import { ReauthPrompt } from '@/components/ReauthPrompt';
import { Button, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { WIPE_CONFIRM_WORD, wipeAllData } from '@/data-rights/wipe';
import { useAppLock } from '@/security/lock/AppLockProvider';

/** F-04: biometria/PIN + palavra de confirmação. */
export default function Wipe() {
  const { resetAfterWipe } = useAppLock();
  const [confirmed, setConfirmed] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!confirmed) {
    return (
      <Screen>
        <ReauthPrompt actionLabel="apagar todos os dados" onConfirmed={() => setConfirmed(true)} />
      </Screen>
    );
  }

  const run = async () => {
    setBusy(true);
    try {
      await wipeAllData();
      resetAfterWipe(); // (app) desmonta → setup da 1ª abertura
    } catch {
      setError('Falha ao apagar. Tente novamente.');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Muted>
        Isto apaga definitivamente o banco de dados, a chave de criptografia, o PIN, as notificações e todos os arquivos temporários.
        Só um backup feito antes permite recuperar os dados.
      </Muted>
      <Field label={`Digite ${WIPE_CONFIRM_WORD} para confirmar`} value={word} onChangeText={setWord} autoCapitalize="characters" />
      <ErrorText>{error}</ErrorText>
      <Button title="Apagar tudo" variant="danger" onPress={run} loading={busy} disabled={word !== WIPE_CONFIRM_WORD} />
    </Screen>
  );
}
